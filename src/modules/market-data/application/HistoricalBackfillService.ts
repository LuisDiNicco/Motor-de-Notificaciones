import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ASSET_REPOSITORY, type IAssetRepository } from './IAssetRepository';
import {
  QUOTE_FALLBACK_PROVIDER,
  QUOTE_PROVIDER,
  type IQuoteProvider,
} from './IQuoteProvider';
import { QUOTE_REPOSITORY, type IQuoteRepository } from './IQuoteRepository';
import { AssetType } from '../domain/enums/AssetType';
import { Asset } from '../domain/entities/Asset';
import { MarketQuote } from '../domain/entities/MarketQuote';

export interface HistoricalBackfillResult {
  processedAssets: number;
  fetchedQuotes: number;
  failedTickers: string[];
  startedAt: string;
  endedAt: string;
}

@Injectable()
export class HistoricalBackfillService {
  private readonly logger = new Logger(HistoricalBackfillService.name);
  private readonly backfillDays: number;
  private readonly perTypeLimit: number;
  private readonly chunkSize: number;
  private readonly chunkDelayMs: number;
  private readonly priorityTickers: string[];

  constructor(
    private readonly configService: ConfigService,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(QUOTE_PROVIDER)
    private readonly quoteProvider: IQuoteProvider,
    @Optional()
    @Inject(QUOTE_FALLBACK_PROVIDER)
    private readonly fallbackQuoteProvider: IQuoteProvider | null,
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepository: IQuoteRepository,
  ) {
    this.backfillDays = this.configService.get<number>(
      'market.backfill.days',
      365,
    );
    this.perTypeLimit = this.configService.get<number>(
      'market.backfill.perTypeLimit',
      20,
    );
    this.chunkSize = this.configService.get<number>(
      'market.backfill.chunkSize',
      5,
    );
    this.chunkDelayMs = this.configService.get<number>(
      'market.backfill.chunkDelayMs',
      150,
    );

    const configuredPriority = this.configService.get<string>(
      'market.backfill.priorityTickers',
      '',
    );
    this.priorityTickers = configuredPriority
      .split(',')
      .map((ticker) => ticker.trim().toUpperCase())
      .filter((ticker) => ticker.length > 0);
  }

  public async runDailyBackfill(
    referenceDate = new Date(),
  ): Promise<HistoricalBackfillResult> {
    return this.runBackfillForTypes(
      [AssetType.STOCK, AssetType.CEDEAR],
      referenceDate,
    );
  }

  public async runBackfillForTicker(
    ticker: string,
    referenceDate = new Date(),
  ): Promise<HistoricalBackfillResult> {
    const asset = await this.assetRepository.findByTicker(ticker);
    if (!asset || !asset.id) {
      return {
        processedAssets: 0,
        fetchedQuotes: 0,
        failedTickers: [ticker.trim().toUpperCase()],
        startedAt: referenceDate.toISOString(),
        endedAt: referenceDate.toISOString(),
      };
    }

    return this.runBackfillForAssets([asset], referenceDate);
  }

  private async runBackfillForTypes(
    types: AssetType[],
    referenceDate: Date,
  ): Promise<HistoricalBackfillResult> {
    const groupedAssets = await Promise.all(
      types.map((type) => this.assetRepository.findAll(type)),
    );

    const selectedAssets = groupedAssets
      .flatMap((assets) =>
        this.selectPrioritizedAssets(assets, this.perTypeLimit),
      )
      .filter(
        (asset): asset is Asset & { id: string } =>
          typeof asset.id === 'string' && asset.id.length > 0,
      );

    return this.runBackfillForAssets(selectedAssets, referenceDate);
  }

  private async runBackfillForAssets(
    assets: Array<Asset & { id: string }> | Asset[],
    referenceDate: Date,
  ): Promise<HistoricalBackfillResult> {
    const startedAt = new Date();
    const failedTickers: string[] = [];
    let processedAssets = 0;
    let fetchedQuotes = 0;

    const endDate = new Date(referenceDate);
    const startDate = new Date(referenceDate);
    startDate.setDate(startDate.getDate() - this.backfillDays);

    const safeChunkSize = Math.max(1, this.chunkSize);
    for (let index = 0; index < assets.length; index += safeChunkSize) {
      const chunk = assets.slice(index, index + safeChunkSize);

      const chunkResults = await Promise.all(
        chunk.map(async (asset) => {
          if (!asset.id) {
            failedTickers.push(asset.ticker);
            return;
          }

          const quotes = await this.fetchHistoricalWithFallback(
            asset,
            startDate,
            endDate,
          );

          if (!quotes) {
            failedTickers.push(asset.ticker);
            return;
          }

          const quotesWithAsset = quotes.map((quote) =>
            quote.withAssetId(asset.id!),
          );
          await this.quoteRepository.saveBulkQuotes(quotesWithAsset);
          processedAssets += 1;
          fetchedQuotes += quotesWithAsset.length;
        }),
      );

      void chunkResults;

      if (index + safeChunkSize < assets.length) {
        await this.sleep(this.chunkDelayMs);
      }
    }

    const endedAt = new Date();
    this.logger.log(
      `Historical backfill finished (assets=${processedAssets}, quotes=${fetchedQuotes}, failed=${failedTickers.length})`,
    );

    return {
      processedAssets,
      fetchedQuotes,
      failedTickers,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    };
  }

  private async fetchHistoricalWithFallback(
    asset: Asset,
    startDate: Date,
    endDate: Date,
  ): Promise<MarketQuote[] | null> {
    try {
      return await this.quoteProvider.fetchHistorical(
        asset.yahooTicker,
        startDate,
        endDate,
      );
    } catch (error) {
      this.logger.warn(
        `Primary historical provider failed for ${asset.ticker}: ${(error as Error).message}`,
      );
    }

    if (!this.fallbackQuoteProvider) {
      return null;
    }

    try {
      return await this.fallbackQuoteProvider.fetchHistorical(
        asset.yahooTicker,
        startDate,
        endDate,
      );
    } catch (error) {
      this.logger.warn(
        `Fallback historical provider failed for ${asset.ticker}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private selectPrioritizedAssets(assets: Asset[], limit: number): Asset[] {
    const safeLimit = Math.max(1, limit);

    const byTicker = new Map(
      assets.map((asset) => [asset.ticker.trim().toUpperCase(), asset]),
    );

    const prioritized: Asset[] = [];
    for (const ticker of this.priorityTickers) {
      const match = byTicker.get(ticker);
      if (match) {
        prioritized.push(match);
      }
      if (prioritized.length >= safeLimit) {
        return prioritized;
      }
    }

    const alreadyIncluded = new Set(
      prioritized.map((asset) => asset.ticker.trim().toUpperCase()),
    );

    for (const asset of assets) {
      const normalized = asset.ticker.trim().toUpperCase();
      if (alreadyIncluded.has(normalized)) {
        continue;
      }

      prioritized.push(asset);
      alreadyIncluded.add(normalized);

      if (prioritized.length >= safeLimit) {
        break;
      }
    }

    return prioritized;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
