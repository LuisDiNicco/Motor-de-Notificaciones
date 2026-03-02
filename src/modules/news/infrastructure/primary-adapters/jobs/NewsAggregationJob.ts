import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FetchLatestNewsUseCase } from '../../../application/FetchLatestNewsUseCase';
import { NewsGateway } from '../../secondary-adapters/websockets/NewsGateway';

@Injectable()
export class NewsAggregationJob {
  private readonly logger = new Logger(NewsAggregationJob.name);

  constructor(
    private readonly fetchLatestNewsUseCase: FetchLatestNewsUseCase,
    private readonly newsGateway: NewsGateway,
  ) {}

  @Cron(process.env['NEWS_AGGREGATION_CRON'] || '*/30 * * * *')
  public async handle(): Promise<void> {
    const startedAt = Date.now();

    try {
      const result = await this.fetchLatestNewsUseCase.execute();
      if (result.insertedArticles.length > 0) {
        this.newsGateway.emitLatest(result.insertedArticles);
      }

      this.logger.log(
        `News aggregation finished in ${Date.now() - startedAt}ms (fetched=${result.fetchedCount}, inserted=${result.insertedCount}, deleted=${result.deletedCount})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.error(
        `News aggregation failed after ${Date.now() - startedAt}ms: ${message}`,
      );
    }
  }
}
