import { ConfigService } from '@nestjs/config';
import { FetchLatestNewsUseCase } from 'src/modules/news/application/FetchLatestNewsUseCase';
import { INewsFeedClient } from 'src/modules/news/application/INewsFeedClient';
import { INewsRepository } from 'src/modules/news/application/INewsRepository';
import { NewsArticle } from 'src/modules/news/domain/entities/NewsArticle';

describe('FetchLatestNewsUseCase', () => {
  it('deduplicates by url, persists only non-existing and cleans old records', async () => {
    const now = new Date('2026-03-02T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const feedClient: INewsFeedClient = {
      fetchLatestNews: jest
        .fn()
        .mockResolvedValue([
          new NewsArticle(
            'GGAL sube en BYMA',
            'https://news.test/ggal-1',
            new Date('2026-03-02T09:00:00.000Z'),
            'ambito',
            'mercados',
            ['GGAL'],
          ),
          new NewsArticle(
            'GGAL sube en BYMA (dup)',
            'https://news.test/ggal-1',
            new Date('2026-03-02T09:02:00.000Z'),
            'ambito',
            'mercados',
            ['GGAL'],
          ),
          new NewsArticle(
            'YPFD anuncia inversión',
            'https://news.test/ypfd-1',
            new Date('2026-03-02T08:00:00.000Z'),
            'cronista',
            'empresas',
            ['YPFD'],
          ),
        ]),
    };

    const repository: INewsRepository = {
      findLatest: jest.fn(),
      saveMany: jest
        .fn()
        .mockImplementation(async (articles: NewsArticle[]) => {
          articles[0]!.id = 'news-1';
          return articles;
        }),
      findExistingUrls: jest
        .fn()
        .mockResolvedValue(new Set(['https://news.test/ypfd-1'])),
      deleteOlderThan: jest.fn().mockResolvedValue(3),
    };

    const configService = {
      get: jest.fn((key: string, fallback: number) => {
        if (key === 'market.newsRetentionDays') {
          return 7;
        }

        return fallback;
      }),
    } as unknown as ConfigService;

    const useCase = new FetchLatestNewsUseCase(
      configService,
      feedClient,
      repository,
    );

    const result = await useCase.execute();

    expect(result.fetchedCount).toBe(2);
    expect(result.insertedCount).toBe(1);
    expect(result.deletedCount).toBe(3);
    expect(result.insertedArticles[0]?.url).toBe('https://news.test/ggal-1');
    expect(repository.saveMany).toHaveBeenCalledTimes(1);
    expect(repository.deleteOlderThan).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});
