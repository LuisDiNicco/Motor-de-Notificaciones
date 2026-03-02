import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PortfolioService } from '../../../../../src/modules/portfolio/application/PortfolioService';
import {
  IPortfolioRepository,
  PORTFOLIO_REPOSITORY,
} from '../../../../../src/modules/portfolio/application/IPortfolioRepository';
import {
  ITradeRepository,
  TRADE_REPOSITORY,
} from '../../../../../src/modules/portfolio/application/ITradeRepository';
import { HoldingsCalculator } from '../../../../../src/modules/portfolio/application/HoldingsCalculator';
import { MarketDataService } from '../../../../../src/modules/market-data/application/MarketDataService';
import { Portfolio } from '../../../../../src/modules/portfolio/domain/entities/Portfolio';
import { Holding } from '../../../../../src/modules/portfolio/domain/entities/Holding';
import { Trade } from '../../../../../src/modules/portfolio/domain/entities/Trade';
import { TradeType } from '../../../../../src/modules/portfolio/domain/enums/TradeType';
import { Asset } from '../../../../../src/modules/market-data/domain/entities/Asset';
import { AssetType } from '../../../../../src/modules/market-data/domain/enums/AssetType';
import { MarketQuote } from '../../../../../src/modules/market-data/domain/entities/MarketQuote';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let repository: jest.Mocked<IPortfolioRepository>;
  let tradeRepository: jest.Mocked<ITradeRepository>;
  let holdingsCalculator: jest.Mocked<HoldingsCalculator>;
  let marketDataService: jest.Mocked<MarketDataService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    repository = {
      findByUserId: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    tradeRepository = {
      findByPortfolioId: jest.fn(),
      findByPortfolioIdPaginated: jest.fn(),
      save: jest.fn(),
    };

    holdingsCalculator = {
      calculateHoldings: jest.fn(),
    } as unknown as jest.Mocked<HoldingsCalculator>;

    marketDataService = {
      getAssets: jest.fn(),
      getAssetQuotes: jest.fn(),
    } as unknown as jest.Mocked<MarketDataService>;

    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    configService.get.mockImplementation(
      (key: string, defaultValue?: number) => {
        if (key === 'market.dataStaleThresholdMinutes') {
          return 30;
        }

        return defaultValue;
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: PORTFOLIO_REPOSITORY,
          useValue: repository,
        },
        {
          provide: TRADE_REPOSITORY,
          useValue: tradeRepository,
        },
        {
          provide: HoldingsCalculator,
          useValue: holdingsCalculator,
        },
        {
          provide: MarketDataService,
          useValue: marketDataService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get(PortfolioService);
  });

  it('creates a portfolio', async () => {
    const portfolio = new Portfolio({ userId: 'user-1', name: 'Main' });
    repository.save.mockResolvedValue(portfolio);

    const saved = await service.createPortfolio('user-1', 'Main');

    expect(saved.name).toBe('Main');
    expect(repository.save).toHaveBeenCalled();
  });

  it('returns user portfolios', async () => {
    const portfolio = new Portfolio({ userId: 'user-1', name: 'Main' });
    repository.findByUserId.mockResolvedValue([portfolio]);

    const result = await service.getUserPortfolios('user-1');

    expect(result).toEqual([portfolio]);
    expect(repository.findByUserId).toHaveBeenCalledWith('user-1');
  });

  it('returns null for portfolio detail when not owned by user', async () => {
    const portfolio = new Portfolio({ userId: 'other-user', name: 'Main' });
    portfolio.id = 'portfolio-1';
    repository.findById.mockResolvedValue(portfolio);

    const result = await service.getPortfolioDetail('user-1', 'portfolio-1');

    expect(result).toBeNull();
  });

  it('deletes portfolio when user owns it', async () => {
    const portfolio = new Portfolio({ userId: 'user-1', name: 'Main' });
    portfolio.id = 'portfolio-1';
    repository.findById.mockResolvedValue(portfolio);

    await service.deletePortfolio('user-1', 'portfolio-1');

    expect(repository.delete).toHaveBeenCalledWith('portfolio-1');
  });

  it('does not delete portfolio when user has no access', async () => {
    repository.findById.mockResolvedValue(null);

    await service.deletePortfolio('user-1', 'portfolio-1');

    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('returns empty holdings when portfolio is not found', async () => {
    repository.findById.mockResolvedValue(null);

    const result = await service.getPortfolioHoldings('user-1', 'portfolio-1');

    expect(result).toEqual([]);
  });

  it('calculates holdings using trades and market prices', async () => {
    const portfolio = new Portfolio({ userId: 'user-1', name: 'Main' });
    portfolio.id = 'portfolio-1';
    repository.findById.mockResolvedValue(portfolio);

    const trade = new Trade({
      portfolioId: 'portfolio-1',
      assetId: 'asset-1',
      tradeType: TradeType.BUY,
      quantity: 10,
      pricePerUnit: 100,
      currency: 'ARS',
      commission: 0,
    });
    tradeRepository.findByPortfolioId.mockResolvedValue([trade]);

    const asset = new Asset(
      'GGAL',
      'Galicia',
      AssetType.STOCK,
      'Fin',
      'GGAL.BA',
    );
    asset.id = 'asset-1';
    marketDataService.getAssets.mockResolvedValue([asset]);
    marketDataService.getAssetQuotes.mockResolvedValue([
      new MarketQuote(new Date(), { closePrice: 120 }),
    ]);

    const expectedHolding = new Holding({
      assetId: 'asset-1',
      ticker: 'GGAL',
      quantity: 10,
      avgCostBasis: 100,
      currentPrice: 120,
      marketValue: 1200,
      costBasis: 1000,
      unrealizedPnl: 200,
      unrealizedPnlPct: 20,
      weight: 1,
      priceAge: 0,
      isStale: false,
    });
    holdingsCalculator.calculateHoldings.mockReturnValue([expectedHolding]);

    const result = await service.getPortfolioHoldings('user-1', 'portfolio-1');

    expect(result).toEqual([expectedHolding]);
    expect(holdingsCalculator.calculateHoldings).toHaveBeenCalled();
  });

  it('uses zero price when quote lookup fails', async () => {
    const portfolio = new Portfolio({ userId: 'user-1', name: 'Main' });
    portfolio.id = 'portfolio-1';
    repository.findById.mockResolvedValue(portfolio);

    const trade = new Trade({
      portfolioId: 'portfolio-1',
      assetId: 'asset-1',
      tradeType: TradeType.BUY,
      quantity: 1,
      pricePerUnit: 100,
      currency: 'ARS',
      commission: 0,
    });
    tradeRepository.findByPortfolioId.mockResolvedValue([trade]);

    const asset = new Asset(
      'GGAL',
      'Galicia',
      AssetType.STOCK,
      'Fin',
      'GGAL.BA',
    );
    asset.id = 'asset-1';
    marketDataService.getAssets.mockResolvedValue([asset]);
    marketDataService.getAssetQuotes.mockRejectedValue(
      new Error('quote provider down'),
    );

    holdingsCalculator.calculateHoldings.mockReturnValue([]);

    await service.getPortfolioHoldings('user-1', 'portfolio-1');

    const priceMap = holdingsCalculator.calculateHoldings.mock
      .calls[0]?.[1] as Map<string, number>;
    expect(priceMap.get('asset-1')).toBe(0);
  });

  it('maps holdings into distribution response', async () => {
    const portfolio = new Portfolio({ userId: 'user-1', name: 'Main' });
    portfolio.id = 'portfolio-1';
    repository.findById.mockResolvedValue(portfolio);

    tradeRepository.findByPortfolioId.mockResolvedValue([]);
    marketDataService.getAssets.mockResolvedValue([]);

    const holdings = [
      new Holding({
        assetId: 'asset-1',
        ticker: 'GGAL',
        quantity: 10,
        avgCostBasis: 100,
        currentPrice: 120,
        marketValue: 1200,
        costBasis: 1000,
        unrealizedPnl: 200,
        unrealizedPnlPct: 20,
        weight: 0.6,
      }),
    ];
    holdingsCalculator.calculateHoldings.mockReturnValue(holdings);

    const result = await service.getPortfolioDistribution(
      'user-1',
      'portfolio-1',
    );

    expect(result).toEqual({
      byAsset: [{ ticker: 'GGAL', value: 1200, weight: 0.6 }],
      byType: [{ type: 'UNKNOWN', value: 1200, weight: 100 }],
      bySector: [{ sector: 'Unknown', value: 1200, weight: 100 }],
      byCurrency: [{ currency: 'ARS', value: 1200, weight: 100 }],
    });
  });

  it('adds priceAge and stale flag based on source timestamp', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-02T12:00:00Z'));

    const portfolio = new Portfolio({ userId: 'user-1', name: 'Main' });
    portfolio.id = 'portfolio-1';
    repository.findById.mockResolvedValue(portfolio);

    const trade = new Trade({
      portfolioId: 'portfolio-1',
      assetId: 'asset-1',
      tradeType: TradeType.BUY,
      quantity: 1,
      pricePerUnit: 100,
      currency: 'ARS',
      commission: 0,
    });
    tradeRepository.findByPortfolioId.mockResolvedValue([trade]);

    const asset = new Asset(
      'GGAL',
      'Galicia',
      AssetType.STOCK,
      'Fin',
      'GGAL.BA',
    );
    asset.id = 'asset-1';
    marketDataService.getAssets.mockResolvedValue([asset]);
    marketDataService.getAssetQuotes.mockResolvedValue([
      new MarketQuote(new Date('2026-03-02T10:00:00Z'), {
        closePrice: 125,
        sourceTimestamp: new Date('2026-03-02T10:00:00Z'),
      }),
    ]);

    const expectedHolding = new Holding({
      assetId: 'asset-1',
      ticker: 'GGAL',
      quantity: 1,
      avgCostBasis: 100,
      currentPrice: 125,
      marketValue: 125,
      costBasis: 100,
      unrealizedPnl: 25,
      unrealizedPnlPct: 25,
      weight: 1,
    });
    holdingsCalculator.calculateHoldings.mockReturnValue([expectedHolding]);

    const result = await service.getPortfolioHoldings('user-1', 'portfolio-1');

    expect(result[0]?.priceAge).toBe(120);
    expect(result[0]?.isStale).toBe(true);

    jest.useRealTimers();
  });

  it('builds interpolated performance points without zeroing missing dates', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-05T12:00:00Z'));

    jest.spyOn(service, 'getPortfolioHoldings').mockResolvedValue([
      new Holding({
        assetId: 'asset-1',
        ticker: 'GGAL',
        quantity: 2,
        avgCostBasis: 100,
        currentPrice: 105,
        marketValue: 210,
        costBasis: 200,
        unrealizedPnl: 10,
        unrealizedPnlPct: 5,
        weight: 1,
      }),
    ]);

    marketDataService.getAssetQuotes.mockResolvedValue([
      new MarketQuote(new Date('2026-03-02T00:00:00Z'), { closePrice: 100 }),
      new MarketQuote(new Date('2026-03-04T00:00:00Z'), { closePrice: 110 }),
    ]);

    const result = await service.getPortfolioPerformance(
      'user-1',
      'portfolio-1',
      '3D',
    );

    expect(result.points.map((point) => point.date)).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
    ]);
    expect(result.points.map((point) => point.value)).toEqual([
      200, 200, 220, 220,
    ]);

    jest.useRealTimers();
  });
});
