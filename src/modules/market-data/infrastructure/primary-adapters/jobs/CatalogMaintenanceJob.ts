import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AssetEntity } from '../../secondary-adapters/database/entities/AssetEntity';
import { Data912QuoteClient } from '../../secondary-adapters/http/clients/Data912QuoteClient';

@Injectable()
export class CatalogMaintenanceJob {
  private readonly logger = new Logger(CatalogMaintenanceJob.name);

  constructor(
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
    private readonly data912QuoteClient: Data912QuoteClient,
  ) {}

  @Cron('0 4 * * 1')
  public async handle(): Promise<void> {
    const startedAt = Date.now();
    const now = new Date();

    try {
      const deactivatedResult = await this.assetRepository.update(
        {
          isActive: true,
          maturityDate: LessThan(now),
        },
        {
          isActive: false,
          lastCatalogCheck: now,
        },
      );

      const [localAssets, liveTickers] = await Promise.all([
        this.assetRepository.find({
          select: {
            ticker: true,
          },
        }),
        this.data912QuoteClient.fetchAvailableTickers(),
      ]);

      const localTickerSet = new Set(
        localAssets.map((asset) => asset.ticker.trim().toUpperCase()),
      );

      const newTickers = liveTickers
        .map((ticker) => ticker.trim().toUpperCase())
        .filter((ticker) => !localTickerSet.has(ticker))
        .sort();

      if (newTickers.length > 0) {
        this.logger.warn(
          `Catalog maintenance detected ${newTickers.length} new Data912 tickers pending manual review: ${newTickers.join(', ')}`,
        );
      }

      await this.assetRepository
        .createQueryBuilder()
        .update(AssetEntity)
        .set({ lastCatalogCheck: now })
        .execute();

      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `Catalog maintenance completed in ${durationMs}ms (deactivated ${deactivatedResult.affected ?? 0} matured assets, detected ${newTickers.length} new tickers)`,
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.error(
        `Catalog maintenance failed after ${durationMs}ms`,
        error as Error,
      );
    }
  }
}
