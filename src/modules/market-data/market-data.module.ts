import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestionModule } from '../ingestion/ingestion.module';
import { MarketDataService } from './application/MarketDataService';
import { ASSET_REPOSITORY } from './application/IAssetRepository';
import { DOLLAR_PROVIDER } from './application/IDollarProvider';
import { RISK_PROVIDER } from './application/IRiskProvider';
import { DOLLAR_QUOTE_REPOSITORY } from './application/IDollarQuoteRepository';
import { COUNTRY_RISK_REPOSITORY } from './application/ICountryRiskRepository';
import {
  BYMA_QUOTE_PROVIDER,
  QUOTE_FALLBACK_PROVIDER,
  QUOTE_PROVIDER,
  RAVA_QUOTE_PROVIDER,
} from './application/IQuoteProvider';
import { QUOTE_REPOSITORY } from './application/IQuoteRepository';
import { MARKET_CACHE } from './application/IMarketCache';
import { PROVIDER_HEALTH_REPOSITORY } from './application/IProviderHealthRepository';
import { TypeOrmAssetRepository } from './infrastructure/secondary-adapters/database/repositories/TypeOrmAssetRepository';
import { TypeOrmDollarQuoteRepository } from './infrastructure/secondary-adapters/database/repositories/TypeOrmDollarQuoteRepository';
import { TypeOrmCountryRiskRepository } from './infrastructure/secondary-adapters/database/repositories/TypeOrmCountryRiskRepository';
import { TypeOrmQuoteRepository } from './infrastructure/secondary-adapters/database/repositories/TypeOrmQuoteRepository';
import { TypeOrmProviderHealthRepository } from './infrastructure/secondary-adapters/database/repositories/TypeOrmProviderHealthRepository';
import { RedisMarketCache } from './infrastructure/secondary-adapters/cache/RedisMarketCache';
import { AssetEntity } from './infrastructure/secondary-adapters/database/entities/AssetEntity';
import { DollarQuoteEntity } from './infrastructure/secondary-adapters/database/entities/DollarQuoteEntity';
import { CountryRiskEntity } from './infrastructure/secondary-adapters/database/entities/CountryRiskEntity';
import { MarketQuoteEntity } from './infrastructure/secondary-adapters/database/entities/MarketQuoteEntity';
import { ProviderHealthEntity } from './infrastructure/secondary-adapters/database/entities/ProviderHealthEntity';
import { RiskProviderClient } from './infrastructure/secondary-adapters/http/clients/RiskProviderClient';
import { Data912QuoteClient } from './infrastructure/secondary-adapters/http/clients/Data912QuoteClient';
import { YahooFinanceClient } from './infrastructure/secondary-adapters/http/clients/YahooFinanceClient';
import { MultiSourceDollarClient } from './infrastructure/secondary-adapters/http/clients/MultiSourceDollarClient';
import { ArgentinaDatosClient } from './infrastructure/secondary-adapters/http/clients/ArgentinaDatosClient';
import { BCRAClient } from './infrastructure/secondary-adapters/http/clients/BCRAClient';
import { RavaScraperClient } from './infrastructure/secondary-adapters/http/clients/RavaScraperClient';
import { BYMADataClient } from './infrastructure/secondary-adapters/http/clients/BYMADataClient';
import { MarketController } from './infrastructure/primary-adapters/http/controllers/MarketController';
import { AssetController } from './infrastructure/primary-adapters/http/controllers/AssetController';
import { SearchController } from './infrastructure/primary-adapters/http/controllers/SearchController';
import { ProviderHealthController } from './infrastructure/primary-adapters/http/controllers/ProviderHealthController';
import { DollarFetchJob } from './infrastructure/primary-adapters/jobs/DollarFetchJob';
import { RiskFetchJob } from './infrastructure/primary-adapters/jobs/RiskFetchJob';
import { StockQuoteFetchJob } from './infrastructure/primary-adapters/jobs/StockQuoteFetchJob';
import { CedearQuoteFetchJob } from './infrastructure/primary-adapters/jobs/CedearQuoteFetchJob';
import { BondQuoteFetchJob } from './infrastructure/primary-adapters/jobs/BondQuoteFetchJob';
import { HistoricalDataJob } from './infrastructure/primary-adapters/jobs/HistoricalDataJob';
import { ProviderHealthJob } from './infrastructure/primary-adapters/jobs/ProviderHealthJob';
import { CatalogMaintenanceJob } from './infrastructure/primary-adapters/jobs/CatalogMaintenanceJob';
import { MarketGateway } from './infrastructure/secondary-adapters/websockets/MarketGateway';
import { ProviderHealthTracker } from './application/ProviderHealthTracker';
import { ProviderScorer } from './application/ProviderScorer';
import { ProviderOrchestrator } from './application/ProviderOrchestrator';
import { MEPCCLCalculationService } from './application/MEPCCLCalculationService';
import { HistoricalBackfillService } from './application/HistoricalBackfillService';
import { MEPCCLCalculationJob } from './infrastructure/primary-adapters/jobs/MEPCCLCalculationJob';
import { HistoricalBackfillJob } from './infrastructure/primary-adapters/jobs/HistoricalBackfillJob';

@Module({
  imports: [
    ConfigModule,
    IngestionModule,
    TypeOrmModule.forFeature([
      AssetEntity,
      MarketQuoteEntity,
      DollarQuoteEntity,
      CountryRiskEntity,
      ProviderHealthEntity,
    ]),
  ],
  controllers: [
    MarketController,
    AssetController,
    SearchController,
    ProviderHealthController,
  ],
  providers: [
    MarketDataService,
    ProviderHealthTracker,
    ProviderScorer,
    ProviderOrchestrator,
    MEPCCLCalculationService,
    HistoricalBackfillService,
    {
      provide: ASSET_REPOSITORY,
      useClass: TypeOrmAssetRepository,
    },
    {
      provide: DOLLAR_QUOTE_REPOSITORY,
      useClass: TypeOrmDollarQuoteRepository,
    },
    {
      provide: COUNTRY_RISK_REPOSITORY,
      useClass: TypeOrmCountryRiskRepository,
    },
    {
      provide: QUOTE_REPOSITORY,
      useClass: TypeOrmQuoteRepository,
    },
    {
      provide: PROVIDER_HEALTH_REPOSITORY,
      useClass: TypeOrmProviderHealthRepository,
    },
    {
      provide: DOLLAR_PROVIDER,
      useClass: MultiSourceDollarClient,
    },
    ArgentinaDatosClient,
    BCRAClient,
    {
      provide: RISK_PROVIDER,
      useClass: RiskProviderClient,
    },
    {
      provide: QUOTE_PROVIDER,
      useClass: Data912QuoteClient,
    },
    {
      provide: QUOTE_FALLBACK_PROVIDER,
      useClass: YahooFinanceClient,
    },
    {
      provide: RAVA_QUOTE_PROVIDER,
      useClass: RavaScraperClient,
    },
    {
      provide: BYMA_QUOTE_PROVIDER,
      useClass: BYMADataClient,
    },
    {
      provide: MARKET_CACHE,
      useClass: RedisMarketCache,
    },
    DollarFetchJob,
    RiskFetchJob,
    StockQuoteFetchJob,
    CedearQuoteFetchJob,
    BondQuoteFetchJob,
    MEPCCLCalculationJob,
    HistoricalBackfillJob,
    HistoricalDataJob,
    ProviderHealthJob,
    CatalogMaintenanceJob,
    MarketGateway,
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
