import { NewsArticle } from '../domain/entities/NewsArticle';

export const NEWS_FEED_CLIENT = 'INewsFeedClient';

export interface INewsFeedClient {
  fetchLatestNews(): Promise<NewsArticle[]>;
}
