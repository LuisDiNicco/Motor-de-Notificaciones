import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NEWS_FEED_CLIENT } from './application/INewsFeedClient';
import { NEWS_REPOSITORY } from './application/INewsRepository';
import { FetchLatestNewsUseCase } from './application/FetchLatestNewsUseCase';
import { GetNewsByTickerUseCase } from './application/GetNewsByTickerUseCase';
import { NewsController } from './infrastructure/primary-adapters/http/controllers/NewsController';
import { NewsAggregationJob } from './infrastructure/primary-adapters/jobs/NewsAggregationJob';
import { NewsArticleEntity } from './infrastructure/secondary-adapters/database/entities/NewsArticleEntity';
import { TypeOrmNewsRepository } from './infrastructure/secondary-adapters/database/repositories/TypeOrmNewsRepository';
import { RSSFeedClient } from './infrastructure/secondary-adapters/http/clients/RSSFeedClient';
import { NewsGateway } from './infrastructure/secondary-adapters/websockets/NewsGateway';
import { AssetEntity } from '../market-data/infrastructure/secondary-adapters/database/entities/AssetEntity';

@Module({
  imports: [TypeOrmModule.forFeature([NewsArticleEntity, AssetEntity])],
  controllers: [NewsController],
  providers: [
    FetchLatestNewsUseCase,
    GetNewsByTickerUseCase,
    NewsAggregationJob,
    NewsGateway,
    {
      provide: NEWS_REPOSITORY,
      useClass: TypeOrmNewsRepository,
    },
    {
      provide: NEWS_FEED_CLIENT,
      useClass: RSSFeedClient,
    },
  ],
  exports: [GetNewsByTickerUseCase],
})
export class NewsModule {}
