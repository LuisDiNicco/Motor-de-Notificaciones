import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketDataService } from '../../../application/MarketDataService';
import { MarketGateway } from '../../secondary-adapters/websockets/MarketGateway';

@Injectable()
export class DollarFetchJob {
  private readonly logger = new Logger(DollarFetchJob.name);

  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly marketGateway: MarketGateway,
  ) {}

  @Cron('*/5 * * * *')
  public async handle(): Promise<void> {
    const startedAt = Date.now();

    try {
      await this.marketDataService.refreshDollarData();
      const latest = await this.marketDataService.getDollarQuotes();
      this.marketGateway.emitDollar(latest);
      const status = await this.marketDataService.getMarketStatus();
      this.marketGateway.emitMarketStatus({
        isOpen: status.marketOpen,
        phase: status.marketOpen ? 'OPEN' : 'CLOSED',
      });
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `Dollar data refreshed with extended sources (ArgentinaDatos + BCRA validation) in ${durationMs}ms`,
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.error(
        `Dollar refresh failed after ${durationMs}ms`,
        error as Error,
      );
    }
  }
}
