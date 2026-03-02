import { Inject, Injectable } from '@nestjs/common';
import {
  INewsRepository,
  NewsListResponse,
  NEWS_REPOSITORY,
} from './INewsRepository';

@Injectable()
export class GetNewsByTickerUseCase {
  constructor(
    @Inject(NEWS_REPOSITORY)
    private readonly newsRepository: INewsRepository,
  ) {}

  public async execute(request: {
    ticker?: string;
    page: number;
    limit: number;
  }): Promise<NewsListResponse> {
    return this.newsRepository.findLatest({
      ticker: request.ticker,
      page: request.page,
      limit: request.limit,
    });
  }
}
