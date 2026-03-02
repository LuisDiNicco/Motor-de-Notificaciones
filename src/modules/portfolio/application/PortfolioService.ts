import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PORTFOLIO_REPOSITORY,
  type IPortfolioRepository,
} from './IPortfolioRepository';
import { Portfolio } from '../domain/entities/Portfolio';
import { TRADE_REPOSITORY, type ITradeRepository } from './ITradeRepository';
import { HoldingsCalculator } from './HoldingsCalculator';
import { Holding } from '../domain/entities/Holding';
import { MarketDataService } from '../../market-data/application/MarketDataService';
import { MarketQuote } from '../../market-data/domain/entities/MarketQuote';
import { AssetType } from '../../market-data/domain/enums/AssetType';

@Injectable()
export class PortfolioService {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRADE_REPOSITORY)
    private readonly tradeRepository: ITradeRepository,
    private readonly holdingsCalculator: HoldingsCalculator,
    private readonly marketDataService: MarketDataService,
    private readonly configService: ConfigService,
  ) {}

  public async createPortfolio(
    userId: string,
    name: string,
    description?: string,
  ): Promise<Portfolio> {
    return this.portfolioRepository.save(
      new Portfolio({
        userId,
        name,
        description: description ?? null,
      }),
    );
  }

  public async getUserPortfolios(userId: string): Promise<Portfolio[]> {
    return this.portfolioRepository.findByUserId(userId);
  }

  public async getPortfolioDetail(
    userId: string,
    portfolioId: string,
  ): Promise<Portfolio | null> {
    const portfolio = await this.portfolioRepository.findById(portfolioId);
    if (!portfolio || portfolio.userId !== userId) {
      return null;
    }

    return portfolio;
  }

  public async deletePortfolio(
    userId: string,
    portfolioId: string,
  ): Promise<void> {
    const portfolio = await this.getPortfolioDetail(userId, portfolioId);
    if (!portfolio?.id) {
      return;
    }

    await this.portfolioRepository.delete(portfolio.id);
  }

  public async getPortfolioHoldings(
    userId: string,
    portfolioId: string,
  ): Promise<Holding[]> {
    const portfolio = await this.getPortfolioDetail(userId, portfolioId);
    if (!portfolio?.id) {
      return [];
    }

    const [trades, assets] = await Promise.all([
      this.tradeRepository.findByPortfolioId(portfolio.id),
      this.marketDataService.getAssets(),
    ]);

    const tradedAssetIds = new Set(trades.map((trade) => trade.assetId));
    const staleThresholdMinutes = this.configService.get<number>(
      'market.dataStaleThresholdMinutes',
      30,
    );

    const assetsById = new Map<
      string,
      {
        ticker: string;
        currentPrice: number;
        priceAgeMinutes: number | null;
        isStale: boolean;
      }
    >();
    for (const asset of assets) {
      if (!asset.id || !tradedAssetIds.has(asset.id)) {
        continue;
      }

      let currentPrice = 0;
      let priceAgeMinutes: number | null = null;
      let isStale = true;
      try {
        const persistedLatestQuote =
          await this.marketDataService.getLatestPersistedAssetQuote(
            asset.ticker,
          );
        const latestQuote =
          persistedLatestQuote ??
          this.pickLatestQuote(
            await this.marketDataService.getAssetQuotes(asset.ticker, 2),
          );
        currentPrice = this.resolveQuotePrice(latestQuote);
        priceAgeMinutes = this.resolvePriceAgeMinutes(latestQuote);
        isStale =
          priceAgeMinutes == null || priceAgeMinutes > staleThresholdMinutes;
      } catch {
        currentPrice = 0;
        priceAgeMinutes = null;
        isStale = true;
      }

      assetsById.set(asset.id, {
        ticker: asset.ticker,
        currentPrice,
        priceAgeMinutes,
        isStale,
      });
    }

    const priceMap = new Map<string, number>();
    const tickerMap = new Map<string, string>();
    for (const [assetId, value] of assetsById.entries()) {
      priceMap.set(assetId, value.currentPrice);
      tickerMap.set(assetId, value.ticker);
    }

    const holdings = this.holdingsCalculator.calculateHoldings(
      trades,
      priceMap,
      tickerMap,
    );

    return holdings.map((holding) => {
      const assetMeta = assetsById.get(holding.assetId);
      return new Holding({
        assetId: holding.assetId,
        ticker: holding.ticker,
        quantity: holding.quantity,
        avgCostBasis: holding.avgCostBasis,
        currentPrice: holding.currentPrice,
        marketValue: holding.marketValue,
        costBasis: holding.costBasis,
        unrealizedPnl: holding.unrealizedPnl,
        unrealizedPnlPct: holding.unrealizedPnlPct,
        weight: holding.weight,
        priceAge: assetMeta?.priceAgeMinutes ?? null,
        isStale: assetMeta?.isStale ?? true,
      });
    });
  }

  public async getPortfolioDistribution(
    userId: string,
    portfolioId: string,
  ): Promise<{
    byAsset: Array<{ ticker: string; value: number; weight: number }>;
    byType: Array<{ type: string; value: number; weight: number }>;
    bySector: Array<{ sector: string; value: number; weight: number }>;
    byCurrency: Array<{ currency: string; value: number; weight: number }>;
  }> {
    const holdings = await this.getPortfolioHoldings(userId, portfolioId);
    const byAsset = holdings.map((holding) => ({
      ticker: holding.ticker,
      value: holding.marketValue,
      weight: holding.weight,
    }));

    const assets = await this.marketDataService.getAssets();
    const assetByTicker = new Map(assets.map((asset) => [asset.ticker, asset]));

    const totalValue = byAsset.reduce((acc, item) => acc + item.value, 0);

    const typeMap = new Map<string, number>();
    const sectorMap = new Map<string, number>();
    const currencyMap = new Map<string, number>();

    for (const item of byAsset) {
      const asset = assetByTicker.get(item.ticker);
      const assetType: AssetType | 'UNKNOWN' = asset?.assetType ?? 'UNKNOWN';
      const sector = asset?.sector ?? 'Unknown';
      const currency =
        assetType === AssetType.CEDEAR ||
        assetType === AssetType.BOND ||
        assetType === AssetType.ON
          ? 'USD'
          : 'ARS';

      typeMap.set(assetType, (typeMap.get(assetType) ?? 0) + item.value);
      sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + item.value);
      currencyMap.set(currency, (currencyMap.get(currency) ?? 0) + item.value);
    }

    const toWeightedList = <T extends string>(
      map: Map<T, number>,
      field: 'type' | 'sector' | 'currency',
    ): Array<{ [K in typeof field]: T } & { value: number; weight: number }> =>
      Array.from(map.entries()).map(([key, value]) => ({
        [field]: key,
        value,
        weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
      })) as Array<
        { [K in typeof field]: T } & { value: number; weight: number }
      >;

    return {
      byAsset,
      byType: toWeightedList(typeMap, 'type'),
      bySector: toWeightedList(sectorMap, 'sector'),
      byCurrency: toWeightedList(currencyMap, 'currency'),
    };
  }

  public async getPortfolioPerformance(
    userId: string,
    portfolioId: string,
    period = '3M',
  ): Promise<{
    period: string;
    points: Array<{ date: string; value: number }>;
  }> {
    const holdings = await this.getPortfolioHoldings(userId, portfolioId);
    if (holdings.length === 0) {
      return {
        period,
        points: [
          {
            date: new Date().toISOString().slice(0, 10),
            value: 0,
          },
        ],
      };
    }

    const periodDays = this.resolvePeriodDays(period);
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - periodDays);

    const quoteSeriesByAsset = new Map<
      string,
      Array<{ date: string; price: number }>
    >();

    for (const holding of holdings) {
      try {
        const persistedQuotes =
          await this.marketDataService.getPersistedAssetQuotesByPeriod(
            holding.ticker,
            startDate,
            endDate,
          );

        const quotes =
          persistedQuotes.length > 0
            ? persistedQuotes
            : await this.marketDataService.getAssetQuotes(
                holding.ticker,
                periodDays + 2,
              );

        const series = quotes
          .map((quote) => ({
            date: quote.date.toISOString().slice(0, 10),
            price: this.resolveQuotePrice(quote),
          }))
          .filter((point) => point.price > 0)
          .sort((left, right) => left.date.localeCompare(right.date));

        quoteSeriesByAsset.set(holding.assetId, series);
      } catch {
        quoteSeriesByAsset.set(holding.assetId, []);
      }
    }

    const points: Array<{ date: string; value: number }> = [];

    for (
      let cursor = new Date(startDate);
      cursor <= endDate;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const pointDate = cursor.toISOString().slice(0, 10);

      const value = holdings.reduce((acc, holding) => {
        const series = quoteSeriesByAsset.get(holding.assetId) ?? [];
        const price = this.resolveInterpolatedPrice(
          series,
          pointDate,
          holding.currentPrice,
        );
        return acc + holding.quantity * price;
      }, 0);

      points.push({ date: pointDate, value });
    }

    return {
      period,
      points,
    };
  }

  private resolvePeriodDays(period: string): number {
    const normalized = period.trim().toUpperCase();
    const match = /^(\d+)(D|W|M|Y)$/.exec(normalized);

    if (!match) {
      return 90;
    }

    const value = Number(match[1]);
    const unit = match[2];

    if (!Number.isFinite(value) || value <= 0) {
      return 90;
    }

    if (unit === 'D') {
      return value;
    }

    if (unit === 'W') {
      return value * 7;
    }

    if (unit === 'M') {
      return value * 30;
    }

    return value * 365;
  }

  private pickLatestQuote(quotes: MarketQuote[]): MarketQuote | null {
    if (quotes.length === 0) {
      return null;
    }

    return (
      [...quotes].sort((left, right) => {
        const leftTimestamp = (left.sourceTimestamp ?? left.date).getTime();
        const rightTimestamp = (right.sourceTimestamp ?? right.date).getTime();
        return rightTimestamp - leftTimestamp;
      })[0] ?? null
    );
  }

  private resolveQuotePrice(quote: MarketQuote | null): number {
    if (!quote) {
      return 0;
    }

    if (typeof quote.closePrice === 'number') {
      return quote.closePrice;
    }

    if (typeof quote.priceArs === 'number') {
      return quote.priceArs;
    }

    if (typeof quote.priceUsd === 'number') {
      return quote.priceUsd;
    }

    return 0;
  }

  private resolvePriceAgeMinutes(quote: MarketQuote | null): number | null {
    if (!quote) {
      return null;
    }

    const timestamp = quote.sourceTimestamp ?? quote.date;
    const diffMs = Date.now() - timestamp.getTime();

    if (Number.isNaN(diffMs) || diffMs < 0) {
      return 0;
    }

    return Math.floor(diffMs / 60000);
  }

  private resolveInterpolatedPrice(
    series: Array<{ date: string; price: number }>,
    targetDate: string,
    fallbackPrice: number,
  ): number {
    if (series.length === 0) {
      return fallbackPrice;
    }

    let latestKnown: number | null = null;

    for (const point of series) {
      if (point.date <= targetDate) {
        latestKnown = point.price;
        continue;
      }

      break;
    }

    if (latestKnown != null) {
      return latestKnown;
    }

    return series[0]?.price ?? fallbackPrice;
  }
}
