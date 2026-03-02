import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { MarketController } from '../src/modules/market-data/infrastructure/primary-adapters/http/controllers/MarketController';
import { AssetController } from '../src/modules/market-data/infrastructure/primary-adapters/http/controllers/AssetController';
import { SearchController } from '../src/modules/market-data/infrastructure/primary-adapters/http/controllers/SearchController';
import { ProviderHealthController } from '../src/modules/market-data/infrastructure/primary-adapters/http/controllers/ProviderHealthController';
import { MarketDataService } from '../src/modules/market-data/application/MarketDataService';
import { ProviderHealthTracker } from '../src/modules/market-data/application/ProviderHealthTracker';
import { Asset } from '../src/modules/market-data/domain/entities/Asset';
import { AssetType } from '../src/modules/market-data/domain/enums/AssetType';
import { DollarQuote } from '../src/modules/market-data/domain/entities/DollarQuote';
import { DollarType } from '../src/modules/market-data/domain/enums/DollarType';
import { CountryRisk } from '../src/modules/market-data/domain/entities/CountryRisk';
import { MarketQuote } from '../src/modules/market-data/domain/entities/MarketQuote';

const assets = [
  new Asset('GGAL', 'Galicia', AssetType.STOCK, 'Financiero', 'GGAL.BA'),
  new Asset('YPFD', 'YPF', AssetType.STOCK, 'Energía', 'YPFD.BA'),
];

describe('Market data endpoints (e2e)', () => {
  let app: INestApplication;

  const marketDataServiceMock = {
    getDollarQuotes: jest
      .fn()
      .mockResolvedValue([
        new DollarQuote(
          DollarType.MEP,
          1300,
          1320,
          new Date(),
          'test-provider',
        ),
      ]),
    getCountryRisk: jest
      .fn()
      .mockResolvedValue(new CountryRisk(680, -0.8, new Date())),
    getCountryRiskHistory: jest
      .fn()
      .mockResolvedValue([
        new CountryRisk(680, -0.8, new Date('2024-01-02T00:00:00.000Z')),
        new CountryRisk(690, 0.4, new Date('2024-01-01T00:00:00.000Z')),
      ]),
    getAssetStats: jest.fn().mockResolvedValue({
      latestClose: 1500000,
      latestVolume: 120000000,
      changePctFromPeriodStart: 1.2,
      maxClose: 1510000,
      minClose: 1495000,
      averageClose: 1502500,
      totalVolume: 120000000,
      points: 2,
    }),
    getMarketSummary: jest.fn().mockResolvedValue({
      dollar: [
        new DollarQuote(
          DollarType.MEP,
          1300,
          1320,
          new Date(),
          'test-provider',
        ),
      ],
      risk: new CountryRisk(680, -0.8, new Date()),
      marketStatus: {
        now: new Date().toISOString(),
        marketOpen: true,
        schedules: {
          stocks: '*/5 10-17 * * 1-5',
          cedears: '*/5 10-17 * * 1-5',
          bonds: '*/15 10-17 * * 1-5',
          dollar: '*/5 * * * *',
          risk: '*/10 * * * *',
        },
        lastUpdate: {
          dollar: new Date().toISOString(),
          risk: new Date().toISOString(),
          quotes: new Date().toISOString(),
        },
      },
      topMovers: {
        stocks: { gainers: [], losers: [] },
        cedears: { gainers: [], losers: [] },
      },
    }),
    getMarketStatus: jest.fn().mockResolvedValue({
      now: new Date().toISOString(),
      marketOpen: true,
      schedules: {
        stocks: '*/5 10-17 * * 1-5',
        cedears: '*/5 10-17 * * 1-5',
        bonds: '*/15 10-17 * * 1-5',
        dollar: '*/5 * * * *',
        risk: '*/10 * * * *',
      },
      lastUpdate: {
        dollar: new Date().toISOString(),
        risk: new Date().toISOString(),
        quotes: new Date().toISOString(),
      },
    }),
    getTopMovers: jest.fn().mockResolvedValue({
      gainers: [
        {
          asset: assets[0],
          quote: new MarketQuote(new Date('2024-01-02T00:00:00.000Z'), {
            assetId: 'asset-1',
            changePct: 4.2,
            closePrice: 1050,
          }),
        },
      ],
      losers: [
        {
          asset: assets[1],
          quote: new MarketQuote(new Date('2024-01-02T00:00:00.000Z'), {
            assetId: 'asset-2',
            changePct: -3.1,
            closePrice: 900,
          }),
        },
      ],
    }),
    getAssetsPaginated: jest.fn().mockResolvedValue({
      data: assets,
      total: assets.length,
    }),
    getAssets: jest.fn().mockResolvedValue(assets),
    getAssetDetailByTicker: jest.fn().mockResolvedValue({
      ticker: 'GGAL',
      name: 'Galicia',
      assetType: AssetType.STOCK,
      sector: 'Financiero',
      yahooTicker: 'GGAL.BA',
      latestQuote: null,
      last5d: [],
      stats30d: null,
    }),
    getAssetByTicker: jest.fn().mockResolvedValue(assets[0]),
    searchAssets: jest.fn().mockResolvedValue([assets[0]]),
    getAssetQuotes: jest.fn().mockResolvedValue([
      new MarketQuote(new Date('2024-01-01T00:00:00.000Z'), {
        assetId: 'asset-1',
        closePrice: 1000,
        openPrice: 980,
      }),
    ]),
  };

  const providerHealthTrackerMock = {
    getProviderHealth: jest.fn().mockResolvedValue({
      updatedAt: new Date('2026-03-02T10:00:00.000Z'),
      providers: [
        {
          providerName: 'data912.com',
          status: 'SUCCESS',
          checks24h: 12,
          uptime24h: 91.67,
          errorRate1h: 0,
          avgLatencyMs: 245,
          lastCheckedAt: new Date('2026-03-02T09:55:00.000Z'),
          lastSuccessAt: new Date('2026-03-02T09:55:00.000Z'),
          lastFailureAt: new Date('2026-03-02T08:10:00.000Z'),
        },
      ],
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        MarketController,
        AssetController,
        SearchController,
        ProviderHealthController,
      ],
      providers: [
        {
          provide: MarketDataService,
          useValue: marketDataServiceMock,
        },
        {
          provide: ProviderHealthTracker,
          useValue: providerHealthTrackerMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/market/dollar (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/market/dollar')
      .expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty('updatedAt');
  });

  it('/api/v1/market/risk (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/market/risk')
      .expect(200);
    expect(response.body.value).toBe(680);
  });

  it('/api/v1/market/summary (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/market/summary')
      .expect(200);
    expect(response.body).toHaveProperty('merval');
    expect(response.body).toHaveProperty('dollar');
    expect(response.body).toHaveProperty('risk');
  });

  it('/api/v1/market/status (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/market/status')
      .expect(200);
    expect(response.body).toHaveProperty('isOpen');
    expect(response.body).toHaveProperty('currentPhase');
  });

  it('/api/v1/market/top-movers (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/market/top-movers?type=STOCK&limit=5')
      .expect(200);
    expect(response.body).toHaveProperty('gainers');
    expect(response.body).toHaveProperty('losers');
    expect(response.body.gainers[0].asset.ticker).toBe('GGAL');
  });

  it('/api/v1/assets (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/assets?type=STOCK&limit=1')
      .expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty('meta');
  });

  it('/api/v1/assets/:ticker (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/assets/GGAL')
      .expect(200);
    expect(response.body.ticker).toBe('GGAL');
  });

  it('/api/v1/search (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/search?q=ggal&limit=5')
      .expect(200);
    expect(response.body.data[0].ticker).toBe('GGAL');
  });

  it('/api/v1/assets/:ticker/quotes (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/assets/GGAL/quotes?days=30')
      .expect(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0].closePrice).toBe(1000);
  });

  it('/api/v1/health/providers (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/providers')
      .expect(200);

    expect(response.body).toHaveProperty('updatedAt');
    expect(Array.isArray(response.body.providers)).toBe(true);
    expect(response.body.providers[0].providerName).toBe('data912.com');
  });
});
