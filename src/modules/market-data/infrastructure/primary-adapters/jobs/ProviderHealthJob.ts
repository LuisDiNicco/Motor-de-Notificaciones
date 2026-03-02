import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProviderHealthTracker } from '../../../application/ProviderHealthTracker';

@Injectable()
export class ProviderHealthJob {
  private readonly logger = new Logger(ProviderHealthJob.name);

  constructor(private readonly providerHealthTracker: ProviderHealthTracker) {}

  @Cron('*/5 * * * *')
  public async handle(): Promise<void> {
    const startedAt = Date.now();

    try {
      const providers =
        await this.providerHealthTracker.refreshRollingMetrics();
      const removedRecords =
        await this.providerHealthTracker.cleanupStaleChecks();
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `Provider health metrics refreshed for ${providers.length} providers in ${durationMs}ms (removed ${removedRecords} stale checks)`,
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.error(
        `Provider health metrics refresh failed after ${durationMs}ms`,
        error as Error,
      );
    }
  }
}
