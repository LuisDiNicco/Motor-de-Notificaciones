import { registerAs } from '@nestjs/config';

export default registerAs('market', () => ({
  dolarApiUrl: process.env['DOLAR_API_URL'] || 'https://dolarapi.com/v1',
  argentinaDatosBaseUrl:
    process.env['ARGENTINA_DATOS_BASE_URL'] ||
    'https://api.argentinadatos.com/v1',
  bcraApiBaseUrl: process.env['BCRA_API_BASE_URL'] || 'https://api.bcra.gob.ar',
  bluelyticsUrl:
    process.env['BLUELYTICS_API_URL'] || 'https://api.bluelytics.com.ar/v2',
  criptoYaUrl: process.env['CRIPTOYA_API_URL'] || 'https://criptoya.com/api',
  ravaBaseUrl: process.env['RAVA_BASE_URL'] || 'https://www.rava.com',
  bymaDataBaseUrl:
    process.env['BYMA_DATA_BASE_URL'] || 'https://open.bymadata.com.ar',
  scrapingRateLimitMs: Number(process.env['SCRAPING_RATE_LIMIT_MS'] || 10000),
  scrapingUserAgent:
    process.env['SCRAPING_USER_AGENT'] ||
    'NotiFinance/2.0 (educational project)',
  dollarCrossValidationThresholdPercent: Number(
    process.env['DOLLAR_CROSS_VALIDATION_THRESHOLD_PERCENT'] || 2,
  ),
  dollarConsensusMaxDeviationPct: Number(
    process.env['DOLLAR_CONSENSUS_MAX_DEVIATION_PCT'] || 8,
  ),
  dollarSourceMaxAgeMinutes: Number(
    process.env['DOLLAR_SOURCE_MAX_AGE_MINUTES'] || 2880,
  ),
  alphaVantageApiKey: process.env['ALPHA_VANTAGE_API_KEY'] || '',
  chunkDelayMs: Number(process.env['MARKET_CHUNK_DELAY_MS'] || 300),
  quoteRetryAttempts: Number(process.env['MARKET_QUOTE_RETRY_ATTEMPTS'] || 3),
  quoteRetryBaseDelayMs: Number(
    process.env['MARKET_QUOTE_RETRY_BASE_DELAY_MS'] || 250,
  ),
  statusCacheTtlSeconds: Number(
    process.env['MARKET_STATUS_CACHE_TTL_SECONDS'] || 30,
  ),
  topMoversCacheTtlSeconds: Number(
    process.env['MARKET_TOP_MOVERS_CACHE_TTL_SECONDS'] || 60,
  ),
  newsAggregationCron: process.env['NEWS_AGGREGATION_CRON'] || '*/30 * * * *',
  newsRetentionDays: Number(process.env['NEWS_RETENTION_DAYS'] || 7),
  newsHttpTimeoutMs: Number(process.env['NEWS_HTTP_TIMEOUT_MS'] || 8000),
  newsMaxItemsPerFeed: Number(process.env['NEWS_MAX_ITEMS_PER_FEED'] || 30),
  newsFeeds: {
    ambito:
      process.env['NEWS_FEED_AMBITO_URL'] ||
      'https://www.ambito.com/rss/pages/mercados.xml',
    cronista:
      process.env['NEWS_FEED_CRONISTA_URL'] ||
      'https://www.cronista.com/files/rss/news.xml',
    infobae:
      process.env['NEWS_FEED_INFOBAE_URL'] ||
      'https://www.infobae.com/arc/outboundfeeds/rss/',
  },
}));
