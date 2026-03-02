import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { validate } from './shared/infrastructure/base/config/env.validation';
import { LoggerConfigModule } from './shared/infrastructure/base/logger/LoggerConfigModule';
import { getDatabaseConfig } from './shared/infrastructure/base/config/database.config';
import { RedisModule } from './shared/infrastructure/base/redis/redis.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { TemplateModule } from './modules/template/template.module';
import { NotificationModule } from './modules/notification/notification.module';
import { HealthModule } from './shared/infrastructure/primary-adapters/http/health/health.module';
import appConfig from './shared/infrastructure/base/config/app.config';
import integrationsConfig from './shared/infrastructure/base/config/integrations.config';
import authConfig from './shared/infrastructure/base/config/auth.config';
import { AuthModule } from './modules/auth/auth.module';
import marketConfig from './shared/infrastructure/base/config/market.config';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { AlertModule } from './modules/alert/alert.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { NewsModule } from './modules/news/news.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
      load: [appConfig, integrationsConfig, authConfig, marketConfig],
    }),
    LoggerConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: 'default',
          ttl: configService.get<number>('app.throttle.ttl', 60),
          limit: configService.get<number>('app.throttle.limit', 100),
        },
        {
          name: 'authenticated',
          ttl: configService.get<number>('app.throttle.ttl', 60),
          limit: configService.get<number>(
            'app.throttle.authenticatedLimit',
            300,
          ),
        },
      ],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    RedisModule,
    IngestionModule,
    AuthModule,
    MarketDataModule,
    AlertModule,
    WatchlistModule,
    PortfolioModule,
    NewsModule,
    PreferencesModule,
    TemplateModule,
    NotificationModule,
    HealthModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
