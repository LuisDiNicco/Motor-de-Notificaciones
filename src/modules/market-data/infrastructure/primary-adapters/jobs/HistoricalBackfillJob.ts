import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HistoricalBackfillService } from '../../../application/HistoricalBackfillService';

@Injectable()
export class HistoricalBackfillJob {
  private readonly logger = new Logger(HistoricalBackfillJob.name);

  constructor(
    private readonly historicalBackfillService: HistoricalBackfillService,
  ) {}

  @Cron('0 4 * * *')
  public async handle(): Promise<void> {
    const startedAt = Date.now();

    try {
      const result = await this.historicalBackfillService.runDailyBackfill();
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `Historical backfill completed in ${durationMs}ms (assets=${result.processedAssets}, quotes=${result.fetchedQuotes}, failed=${result.failedTickers.length})`,
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.error(
        `Historical backfill failed after ${durationMs}ms`,
        error as Error,
      );
    }
  }
}
