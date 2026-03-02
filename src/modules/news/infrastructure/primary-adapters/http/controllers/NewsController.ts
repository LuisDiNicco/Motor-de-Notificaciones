import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetNewsByTickerUseCase } from '../../../../application/GetNewsByTickerUseCase';
import { NewsListQueryRequest } from './request/NewsListQueryRequest';

@ApiTags('News')
@Controller('news')
export class NewsController {
  constructor(
    private readonly getNewsByTickerUseCase: GetNewsByTickerUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get latest news with optional ticker filter' })
  @ApiResponse({ status: 200 })
  public async getNews(@Query() query: NewsListQueryRequest): Promise<{
    data: Array<{
      id?: string;
      title: string;
      url: string;
      source: string;
      category: string | null;
      publishedAt: string;
      mentionedTickers: string[];
    }>;
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const result = await this.getNewsByTickerUseCase.execute({
      ticker: query.ticker?.toUpperCase(),
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.data.map((article) => ({
        id: article.id,
        title: article.title,
        url: article.url,
        source: article.source,
        category: article.category,
        publishedAt: article.publishedAt.toISOString(),
        mentionedTickers: article.mentionedTickers,
      })),
      meta: {
        page: result.page,
        limit: query.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }
}
