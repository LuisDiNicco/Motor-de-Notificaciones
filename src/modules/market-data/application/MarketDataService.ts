import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type IAssetRepository, ASSET_REPOSITORY } from './IAssetRepository';
import { type IDollarProvider, DOLLAR_PROVIDER } from './IDollarProvider';
import { type IRiskProvider, RISK_PROVIDER } from './IRiskProvider';
import {
  type IDollarQuoteRepository,
  DOLLAR_QUOTE_REPOSITORY,
} from './IDollarQuoteRepository';
import {
  type ICountryRiskRepository,
  COUNTRY_RISK_REPOSITORY,
} from './ICountryRiskRepository';
import {
  type IQuoteProvider,
  QUOTE_FALLBACK_PROVIDER,
  QUOTE_PROVIDER,
} from './IQuoteProvider';
import { type IQuoteRepository, QUOTE_REPOSITORY } from './IQuoteRepository';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../ingestion/application/IEventPublisher';
import { EventPayload } from '../../ingestion/domain/EventPayload';
import { EventType } from '../../ingestion/domain/enums/EventType';
import { DollarQuote } from '../domain/entities/DollarQuote';
import { CountryRisk } from '../domain/entities/CountryRisk';
import { Asset } from '../domain/entities/Asset';
import { MarketQuote } from '../domain/entities/MarketQuote';
import { AssetType } from '../domain/enums/AssetType';
import { DollarType } from '../domain/enums/DollarType';
import { AssetNotFoundError } from '../domain/errors/AssetNotFoundError';
import { MarketDataUnavailableError } from '../domain/errors/MarketDataUnavailableError';
import { MARKET_CACHE, type IMarketCache } from './IMarketCache';
import { ProviderOrchestrator } from './ProviderOrchestrator';

export interface MarketQuoteUpdate {
  ticker: string;
  priceArs: number;
  changePct: number;
  volume: number;
  timestamp: string;
}

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly chunkDelayMs: number;
  private readonly quoteRetryAttempts: number;
  private readonly quoteRetryBaseDelayMs: number;
  private readonly statusCacheTtlSeconds: number;
  private readonly topMoversCacheTtlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(MARKET_CACHE)
    private readonly marketCache: IMarketCache,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(DOLLAR_PROVIDER)
    private readonly dollarProvider: IDollarProvider,
    @Inject(RISK_PROVIDER)
    private readonly riskProvider: IRiskProvider,
    @Inject(DOLLAR_QUOTE_REPOSITORY)
    private readonly dollarQuoteRepository: IDollarQuoteRepository,
    @Inject(COUNTRY_RISK_REPOSITORY)
    private readonly countryRiskRepository: ICountryRiskRepository,
    @Inject(QUOTE_PROVIDER)
    private readonly quoteProvider: IQuoteProvider,
    @Optional()
    @Inject(QUOTE_FALLBACK_PROVIDER)
    private readonly fallbackQuoteProvider: IQuoteProvider | null,
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepository: IQuoteRepository,
    @Optional()
    private readonly providerOrchestrator: ProviderOrchestrator | null,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {
    this.chunkDelayMs = this.configService.get<number>(
      'market.chunkDelayMs',
      300,
    );
    this.quoteRetryAttempts = this.configService.get<number>(
      'market.quoteRetryAttempts',
      3,
    );
    this.quoteRetryBaseDelayMs = this.configService.get<number>(
      'market.quoteRetryBaseDelayMs',
      250,
    );
    this.statusCacheTtlSeconds = this.configService.get<number>(
      'market.statusCacheTtlSeconds',
      30,
    );
    this.topMoversCacheTtlSeconds = this.configService.get<number>(
      'market.topMoversCacheTtlSeconds',
      60,
    );
  }

  public async getDollarQuotes(): Promise<DollarQuote[]> {
    try {
      const quotes = await this.dollarProvider.fetchAllDollarQuotes();
      await this.dollarQuoteRepository.saveMany(quotes);
      return quotes;
    } catch {
      this.logger.warn(
        'Dollar provider failed, trying persisted data fallback',
      );
      const persistedQuotes =
        await this.dollarQuoteRepository.findLatestByType();

      if (persistedQuotes.length > 0) {
        return persistedQuotes;
      }

      throw new MarketDataUnavailableError('DOLLAR');
    }
  }

  public async getCountryRisk(): Promise<CountryRisk> {
    try {
      const risk = await this.riskProvider.fetchCountryRisk();
      await this.countryRiskRepository.save(risk);
      return risk;
    } catch {
      this.logger.warn('Risk provider failed, trying persisted data fallback');
      const persistedRisk = await this.countryRiskRepository.findLatest();

      if (persistedRisk) {
        return persistedRisk;
      }

      throw new MarketDataUnavailableError('COUNTRY_RISK');
    }
  }

  public async getDollarHistory(
    type: DollarType,
    days = 30,
  ): Promise<DollarQuote[]> {
    return this.dollarQuoteRepository.findHistoryByType(type, days);
  }

  public async getCountryRiskHistory(days = 30): Promise<CountryRisk[]> {
    return this.countryRiskRepository.findHistory(days);
  }

  public async getAssets(type?: AssetType): Promise<Asset[]> {
    return this.assetRepository.findAll(type);
  }

  public async getAssetsPaginated(params: {
    type?: AssetType;
    page: number;
    limit: number;
  }): Promise<{ data: Asset[]; total: number }> {
    return this.assetRepository.findPaginated(params);
  }

  public async getAssetByTicker(ticker: string): Promise<Asset> {
    const asset = await this.assetRepository.findByTicker(ticker);

    if (!asset) {
      throw new AssetNotFoundError(ticker);
    }

    return asset;
  }

  public async searchAssets(query: string, limit = 10): Promise<Asset[]> {
    return this.assetRepository.search(query, limit);
  }

  public async getAssetQuotes(
    ticker: string,
    days = 30,
  ): Promise<MarketQuote[]> {
    const asset = await this.getAssetByTicker(ticker);
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - Math.max(days, 1));

    try {
      const quotes = await this.quoteProvider.fetchHistorical(
        asset.yahooTicker,
        startDate,
        endDate,
      );

      if (!asset.id) {
        return quotes;
      }

      const quotesWithAsset = quotes.map((quote) =>
        quote.withAssetId(asset.id!),
      );
      await this.quoteRepository.saveBulkQuotes(quotesWithAsset);
      return quotesWithAsset;
    } catch {
      this.logger.warn(
        `Quote provider failed for ${asset.ticker}, trying persisted data fallback`,
      );

      if (!asset.id) {
        throw new MarketDataUnavailableError(asset.ticker);
      }

      const persistedQuotes = await this.quoteRepository.findByAssetAndPeriod(
        asset.id,
        startDate,
        endDate,
      );

      if (persistedQuotes.length > 0) {
        return persistedQuotes;
      }

      throw new MarketDataUnavailableError(asset.ticker);
    }
  }

  public async getAssetStats(
    ticker: string,
    days = 30,
  ): Promise<{
    ticker: string;
    points: number;
    minClose: number;
    maxClose: number;
    latestClose: number;
    changePctFromPeriodStart: number;
  }> {
    const quotes = await this.getAssetQuotes(ticker, days);
    const closes = quotes
      .map((quote) => quote.closePrice)
      .filter((value): value is number => typeof value === 'number');

    if (closes.length === 0) {
      return {
        ticker,
        points: 0,
        minClose: 0,
        maxClose: 0,
        latestClose: 0,
        changePctFromPeriodStart: 0,
      };
    }

    const first = closes[0]!;
    const latest = closes[closes.length - 1]!;
    const changePct = first === 0 ? 0 : ((latest - first) / first) * 100;

    return {
      ticker,
      points: closes.length,
      minClose: Math.min(...closes),
      maxClose: Math.max(...closes),
      latestClose: latest,
      changePctFromPeriodStart: changePct,
    };
  }

  public async getRelatedAssets(ticker: string, limit = 5): Promise<Asset[]> {
    const asset = await this.getAssetByTicker(ticker);
    const sameType = await this.assetRepository.findAll(asset.assetType);

    return sameType
      .filter((item) => item.ticker !== asset.ticker)
      .slice(0, Math.max(limit, 1));
  }

  public async getTopGainers(
    type: AssetType = AssetType.STOCK,
    limit = 5,
  ): Promise<Asset[]> {
    const movers = await this.getTopMovers(type, limit);
    return movers.gainers.map((item) => item.asset);
  }

  public async getTopLosers(
    type: AssetType = AssetType.STOCK,
    limit = 5,
  ): Promise<Asset[]> {
    const movers = await this.getTopMovers(type, limit);
    return movers.losers.map((item) => item.asset);
  }

  public async getMarketSummary(): Promise<{
    dollar: DollarQuote[];
    risk: CountryRisk;
    marketStatus: {
      now: string;
      marketOpen: boolean;
      schedules: {
        stocks: string;
        cedears: string;
        bonds: string;
        dollar: string;
        risk: string;
      };
      lastUpdate: {
        dollar: string | null;
        risk: string | null;
        quotes: string | null;
      };
    };
    topMovers: {
      stocks: {
        gainers: Array<{
          ticker: string;
          name: string;
          priceArs: number;
          changePct: number;
        }>;
        losers: Array<{
          ticker: string;
          name: string;
          priceArs: number;
          changePct: number;
        }>;
      };
      cedears: {
        gainers: Array<{
          ticker: string;
          name: string;
          priceArs: number;
          changePct: number;
        }>;
        losers: Array<{
          ticker: string;
          name: string;
          priceArs: number;
          changePct: number;
        }>;
      };
    };
  }> {
    const [dollar, risk, marketStatus, stockMovers, cedearMovers] =
      await Promise.all([
        this.getDollarQuotes(),
        this.getCountryRisk(),
        this.getMarketStatus(),
        this.getTopMovers(AssetType.STOCK, 5),
        this.getTopMovers(AssetType.CEDEAR, 5),
      ]);

    const mapMover = (item: { asset: Asset; quote: MarketQuote }) => ({
      ticker: item.asset.ticker,
      name: item.asset.name,
      priceArs: item.quote.closePrice ?? 0,
      changePct: item.quote.changePct ?? 0,
    });

    return {
      dollar,
      risk,
      marketStatus,
      topMovers: {
        stocks: {
          gainers: stockMovers.gainers.map(mapMover),
          losers: stockMovers.losers.map(mapMover),
        },
        cedears: {
          gainers: cedearMovers.gainers.map(mapMover),
          losers: cedearMovers.losers.map(mapMover),
        },
      },
    };
  }

  public async refreshDollarData(): Promise<void> {
    const quotes = await this.getDollarQuotes();

    await this.publishMarketEvent(EventType.MARKET_DOLLAR_UPDATED, {
      quotesUpdated: quotes.length,
      refreshedAt: new Date().toISOString(),
    });
  }

  public async refreshRiskData(): Promise<CountryRisk> {
    const risk = await this.getCountryRisk();

    await this.publishMarketEvent(EventType.MARKET_RISK_UPDATED, {
      value: risk.value,
      changePct: risk.changePct,
      refreshedAt: new Date().toISOString(),
    });

    return risk;
  }

  public async refreshStockQuotes(): Promise<{
    updatedCount: number;
    updates: MarketQuoteUpdate[];
  }> {
    return this.refreshQuotesByTypes([AssetType.STOCK], 10);
  }

  public async refreshCedearQuotes(): Promise<{
    updatedCount: number;
    updates: MarketQuoteUpdate[];
  }> {
    return this.refreshQuotesByTypes([AssetType.CEDEAR], 20);
  }

  public async refreshBondQuotes(): Promise<{
    updatedCount: number;
    updates: MarketQuoteUpdate[];
  }> {
    return this.refreshQuotesByTypes(
      [AssetType.BOND, AssetType.LECAP, AssetType.BONCAP, AssetType.ON],
      20,
    );
  }

  public async getMarketStatus(): Promise<{
    now: string;
    marketOpen: boolean;
    schedules: {
      stocks: string;
      cedears: string;
      bonds: string;
      dollar: string;
      risk: string;
    };
    lastUpdate: {
      dollar: string | null;
      risk: string | null;
      quotes: string | null;
    };
  }> {
    const cacheKey = 'market:status';
    const cached = await this.marketCache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as {
        now: string;
        marketOpen: boolean;
        schedules: {
          stocks: string;
          cedears: string;
          bonds: string;
          dollar: string;
          risk: string;
        };
        lastUpdate: {
          dollar: string | null;
          risk: string | null;
          quotes: string | null;
        };
      };
    }

    const [latestDollar, latestRisk, latestQuote] = await Promise.all([
      this.dollarQuoteRepository.findLatestTimestamp(),
      this.countryRiskRepository
        .findLatest()
        .then((risk: CountryRisk | null) => risk?.timestamp ?? null),
      this.quoteRepository.findLatestTimestamp(),
    ]);

    const response = {
      now: new Date().toISOString(),
      marketOpen: this.isArgentineMarketOpen(new Date()),
      schedules: {
        stocks: '*/5 10-17 * * 1-5',
        cedears: '*/5 10-17 * * 1-5',
        bonds: '*/15 10-17 * * 1-5',
        dollar: '*/5 * * * *',
        risk: '*/10 * * * *',
      },
      lastUpdate: {
        dollar: this.toIsoStringOrNull(latestDollar),
        risk: this.toIsoStringOrNull(latestRisk),
        quotes: this.toIsoStringOrNull(latestQuote),
      },
    };

    await this.marketCache.set(
      cacheKey,
      JSON.stringify(response),
      this.statusCacheTtlSeconds,
    );
    return response;
  }

  public async getTopMovers(
    assetType: AssetType = AssetType.STOCK,
    limit = 5,
  ): Promise<{
    gainers: Array<{ asset: Asset; quote: MarketQuote }>;
    losers: Array<{ asset: Asset; quote: MarketQuote }>;
  }> {
    const cacheKey = `market:top-movers:${assetType}:${limit}`;
    const cached = await this.marketCache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as {
        gainers: Array<{ asset: Asset; quote: MarketQuote }>;
        losers: Array<{ asset: Asset; quote: MarketQuote }>;
      };
    }

    const [movers, assets] = await Promise.all([
      this.quoteRepository.findTopMovers(assetType, limit),
      this.assetRepository.findAll(assetType),
    ]);

    const assetsById = new Map<string, Asset>();
    for (const asset of assets) {
      if (asset.id) {
        assetsById.set(asset.id, asset);
      }
    }

    const mapWithAsset = (quotes: MarketQuote[]) =>
      quotes
        .map((quote) => {
          if (!quote.assetId) {
            return null;
          }

          const asset = assetsById.get(quote.assetId);
          if (!asset) {
            return null;
          }

          return {
            asset,
            quote,
          };
        })
        .filter(
          (item): item is { asset: Asset; quote: MarketQuote } => item !== null,
        );

    const response = {
      gainers: mapWithAsset(movers.gainers),
      losers: mapWithAsset(movers.losers),
    };

    await this.marketCache.set(
      cacheKey,
      JSON.stringify(response),
      this.topMoversCacheTtlSeconds,
    );
    return response;
  }

  private async publishMarketEvent(
    eventType: EventType,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const event = new EventPayload(randomUUID(), eventType, 'system', metadata);

    await this.eventPublisher.publishEvent(event, randomUUID());
  }

  private async refreshQuotesByTypes(
    types: AssetType[],
    chunkSize: number,
  ): Promise<{ updatedCount: number; updates: MarketQuoteUpdate[] }> {
    const groupedAssets = await Promise.all(
      types.map((type) => this.assetRepository.findAll(type)),
    );
    const assets = groupedAssets.flat().filter((asset) => Boolean(asset.id));
    let updatedCount = 0;
    const updates: MarketQuoteUpdate[] = [];

    for (let i = 0; i < assets.length; i += chunkSize) {
      const chunk = assets.slice(i, i + chunkSize);

      const chunkResults = await Promise.all(
        chunk.map(async (asset) => {
          try {
            const quote = await this.fetchQuoteWithRetry(
              asset.assetType,
              asset.yahooTicker,
            );
            const quoteWithAsset = quote.withAssetId(asset.id!);
            await this.quoteRepository.saveBulkQuotes([quoteWithAsset]);

            await this.publishMarketEvent(EventType.MARKET_QUOTE_UPDATED, {
              assetId: asset.id,
              ticker: asset.ticker,
              assetType: asset.assetType,
              yahooTicker: asset.yahooTicker,
              closePrice: quoteWithAsset.closePrice,
              changePct: quoteWithAsset.changePct,
              date: quoteWithAsset.date.toISOString(),
            });

            updates.push({
              ticker: asset.ticker,
              priceArs:
                quoteWithAsset.closePrice ?? quoteWithAsset.priceArs ?? 0,
              changePct: quoteWithAsset.changePct ?? 0,
              volume: quoteWithAsset.volume ?? 0,
              timestamp: quoteWithAsset.date.toISOString(),
            });

            return 1;
          } catch (error) {
            this.logger.warn(
              `Failed to refresh quote for ${asset.ticker}: ${(error as Error).message}`,
            );
            return 0;
          }
        }),
      );

      updatedCount += chunkResults.filter((result) => result === 1).length;

      if (i + chunkSize < assets.length) {
        await this.sleep(this.chunkDelayMs);
      }
    }

    return {
      updatedCount,
      updates,
    };
  }

  private async fetchQuoteWithRetry(
    assetType: AssetType,
    yahooTicker: string,
  ): Promise<MarketQuote> {
    if (this.providerOrchestrator) {
      const orchestrated = await this.providerOrchestrator.fetchQuote(
        assetType,
        yahooTicker,
      );
      return orchestrated.quote;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.quoteRetryAttempts; attempt += 1) {
      try {
        return await this.quoteProvider.fetchQuote(yahooTicker);
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.quoteRetryAttempts) {
          const delay = this.quoteRetryBaseDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    if (this.fallbackQuoteProvider) {
      try {
        this.logger.warn(`Using fallback quote provider for ${yahooTicker}`);
        return await this.fallbackQuoteProvider.fetchQuote(yahooTicker);
      } catch (fallbackError) {
        lastError = fallbackError as Error;
      }
    }

    throw lastError ?? new Error(`Unable to fetch quote for ${yahooTicker}`);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private isArgentineMarketOpen(now: Date): boolean {
    const day = now.getUTCDay();
    if (day === 0 || day === 6) {
      return false;
    }

    const argentinaHour = (now.getUTCHours() - 3 + 24) % 24;
    return argentinaHour >= 10 && argentinaHour <= 17;
  }

  private toIsoStringOrNull(value: Date | null): string | null {
    if (!value || Number.isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString();
  }
}
