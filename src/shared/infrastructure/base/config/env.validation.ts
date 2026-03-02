import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsString,
  validateSync,
  IsOptional,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  RABBITMQ_URL: string = 'amqp://guest:guest@localhost:5672';

  @IsString()
  @IsOptional()
  REDIS_URL: string = 'redis://localhost:6379';

  @IsString()
  @IsOptional()
  DATABASE_URL: string = 'postgres://postgres:postgres@localhost:5432/noticore';

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3000';

  @IsNumber()
  @IsOptional()
  THROTTLE_TTL: number = 60;

  @IsNumber()
  @IsOptional()
  THROTTLE_LIMIT: number = 30;

  @IsNumber()
  @IsOptional()
  THROTTLE_AUTHENTICATED_LIMIT: number = 300;

  @IsBoolean()
  @IsOptional()
  RUN_MIGRATIONS: boolean = true;

  @IsString()
  @IsOptional()
  JWT_SECRET: string = 'change-me-access-secret';

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET: string = 'change-me-refresh-secret';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  @IsNumber()
  @IsOptional()
  AUTH_LOGIN_MAX_ATTEMPTS: number = 5;

  @IsNumber()
  @IsOptional()
  AUTH_LOGIN_LOCKOUT_MINUTES: number = 15;

  @IsString()
  @IsOptional()
  DOLAR_API_URL: string = 'https://dolarapi.com/v1';

  @IsString()
  @IsOptional()
  ALPHA_VANTAGE_API_KEY: string = '';

  @IsNumber()
  @IsOptional()
  MARKET_CHUNK_DELAY_MS: number = 300;

  @IsNumber()
  @IsOptional()
  MARKET_QUOTE_RETRY_ATTEMPTS: number = 3;

  @IsNumber()
  @IsOptional()
  MARKET_QUOTE_RETRY_BASE_DELAY_MS: number = 250;

  @IsNumber()
  @IsOptional()
  MARKET_STATUS_CACHE_TTL_SECONDS: number = 30;

  @IsNumber()
  @IsOptional()
  MARKET_TOP_MOVERS_CACHE_TTL_SECONDS: number = 60;

  @IsNumber()
  @IsOptional()
  DATA_STALE_THRESHOLD_MINUTES: number = 30;

  @IsString()
  @IsOptional()
  NEWS_AGGREGATION_CRON: string = '*/30 * * * *';

  @IsNumber()
  @IsOptional()
  NEWS_RETENTION_DAYS: number = 7;

  @IsNumber()
  @IsOptional()
  NEWS_HTTP_TIMEOUT_MS: number = 8000;

  @IsNumber()
  @IsOptional()
  NEWS_MAX_ITEMS_PER_FEED: number = 30;

  @IsString()
  @IsOptional()
  NEWS_FEED_AMBITO_URL: string =
    'https://www.ambito.com/rss/pages/mercados.xml';

  @IsString()
  @IsOptional()
  NEWS_FEED_CRONISTA_URL: string =
    'https://www.cronista.com/files/rss/news.xml';

  @IsString()
  @IsOptional()
  NEWS_FEED_INFOBAE_URL: string =
    'https://www.infobae.com/arc/outboundfeeds/rss/';
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
