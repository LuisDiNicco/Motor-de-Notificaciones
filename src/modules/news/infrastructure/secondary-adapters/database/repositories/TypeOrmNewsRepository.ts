import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  INewsRepository,
  NewsListRequest,
  NewsListResponse,
} from '../../../../application/INewsRepository';
import { NewsArticle } from '../../../../domain/entities/NewsArticle';
import { NewsArticleEntity } from '../entities/NewsArticleEntity';

@Injectable()
export class TypeOrmNewsRepository implements INewsRepository {
  constructor(
    @InjectRepository(NewsArticleEntity)
    private readonly repository: Repository<NewsArticleEntity>,
  ) {}

  public async findLatest(request: NewsListRequest): Promise<NewsListResponse> {
    const page = Math.max(1, request.page);
    const limit = Math.min(100, Math.max(1, request.limit));

    const queryBuilder = this.repository
      .createQueryBuilder('article')
      .orderBy('article.publishedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (request.ticker) {
      queryBuilder.andWhere(':ticker = ANY(article.mentionedTickers)', {
        ticker: request.ticker.toUpperCase(),
      });
    }

    const [entities, total] = await queryBuilder.getManyAndCount();

    return {
      data: entities.map((entity) => this.toDomain(entity)),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  public async saveMany(articles: NewsArticle[]): Promise<NewsArticle[]> {
    const entities = articles.map((article) =>
      this.repository.create({
        title: article.title,
        url: article.url,
        source: article.source,
        category: article.category,
        publishedAt: article.publishedAt,
        mentionedTickers: article.mentionedTickers,
      }),
    );

    const saved = await this.repository.save(entities);
    return saved.map((entity) => this.toDomain(entity));
  }

  public async findExistingUrls(urls: string[]): Promise<Set<string>> {
    if (urls.length === 0) {
      return new Set<string>();
    }

    const normalizedUrls = Array.from(
      new Set(urls.map((url) => url.trim().toLowerCase())),
    );

    const entities = await this.repository.find({
      select: { url: true },
      where: { url: In(normalizedUrls) },
    });

    return new Set(entities.map((entity) => entity.url.trim().toLowerCase()));
  }

  public async deleteOlderThan(cutoffDate: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(NewsArticleEntity)
      .where('publishedAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected ?? 0;
  }

  private toDomain(entity: NewsArticleEntity): NewsArticle {
    const article = new NewsArticle(
      entity.title,
      entity.url,
      entity.publishedAt,
      entity.source,
      entity.category,
      entity.mentionedTickers,
    );
    article.id = entity.id;
    return article;
  }
}
