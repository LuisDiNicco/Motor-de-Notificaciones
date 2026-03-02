import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INewsFeedClient, NEWS_FEED_CLIENT } from './INewsFeedClient';
import { INewsRepository, NEWS_REPOSITORY } from './INewsRepository';
import { NewsArticle } from '../domain/entities/NewsArticle';

export interface FetchLatestNewsResult {
  fetchedCount: number;
  insertedCount: number;
  deletedCount: number;
  insertedArticles: NewsArticle[];
}

@Injectable()
export class FetchLatestNewsUseCase {
  private readonly logger = new Logger(FetchLatestNewsUseCase.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(NEWS_FEED_CLIENT)
    private readonly newsFeedClient: INewsFeedClient,
    @Inject(NEWS_REPOSITORY)
    private readonly newsRepository: INewsRepository,
  ) {}

  public async execute(): Promise<FetchLatestNewsResult> {
    const fetchedArticles = await this.newsFeedClient.fetchLatestNews();
    const deduplicatedFetchedArticles = this.deduplicateByUrl(fetchedArticles);
    const existingUrls = await this.newsRepository.findExistingUrls(
      deduplicatedFetchedArticles.map((article) => article.url),
    );

    const newArticles = deduplicatedFetchedArticles.filter(
      (article) => !existingUrls.has(article.url),
    );

    const insertedArticles =
      newArticles.length > 0
        ? await this.newsRepository.saveMany(newArticles)
        : [];

    const retentionDays = this.configService.get<number>(
      'market.newsRetentionDays',
      7,
    );
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deletedCount = await this.newsRepository.deleteOlderThan(cutoffDate);

    this.logger.log(
      `News aggregation completed (fetched=${deduplicatedFetchedArticles.length}, inserted=${insertedArticles.length}, deleted=${deletedCount})`,
    );

    return {
      fetchedCount: deduplicatedFetchedArticles.length,
      insertedCount: insertedArticles.length,
      deletedCount,
      insertedArticles,
    };
  }

  private deduplicateByUrl(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set<string>();
    const deduplicated: NewsArticle[] = [];

    for (const article of articles) {
      const normalizedUrl = article.url.trim().toLowerCase();
      if (seen.has(normalizedUrl)) {
        continue;
      }

      seen.add(normalizedUrl);
      deduplicated.push(article);
    }

    return deduplicated;
  }
}
