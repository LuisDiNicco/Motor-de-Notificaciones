import { NewsArticle } from '../domain/entities/NewsArticle';

export const NEWS_REPOSITORY = 'INewsRepository';

export interface NewsListRequest {
  ticker?: string;
  page: number;
  limit: number;
}

export interface NewsListResponse {
  data: NewsArticle[];
  total: number;
  page: number;
  totalPages: number;
}

export interface INewsRepository {
  findLatest(request: NewsListRequest): Promise<NewsListResponse>;
  saveMany(articles: NewsArticle[]): Promise<NewsArticle[]>;
  findExistingUrls(urls: string[]): Promise<Set<string>>;
  deleteOlderThan(cutoffDate: Date): Promise<number>;
}
