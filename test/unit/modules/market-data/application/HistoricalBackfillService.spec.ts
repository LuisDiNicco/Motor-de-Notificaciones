import { ConfigService } from '@nestjs/config';
import { HistoricalBackfillService } from '../../../../../src/modules/market-data/application/HistoricalBackfillService';
import { IAssetRepository } from '../../../../../src/modules/market-data/application/IAssetRepository';
import { IQuoteProvider } from '../../../../../src/modules/market-data/application/IQuoteProvider';
import { IQuoteRepository } from '../../../../../src/modules/market-data/application/IQuoteRepository';
import { Asset } from '../../../../../src/modules/market-data/domain/entities/Asset';
import { MarketQuote } from '../../../../../src/modules/market-data/domain/entities/MarketQuote';
import { AssetType } from '../../../../../src/modules/market-data/domain/enums/AssetType';

describe('HistoricalBackfillService', () => {
  const referenceDate = new Date('2026-03-02T00:00:00.000Z');

  const makeAsset = (ticker: string, type: AssetType): Asset => {
    const asset = new Asset(ticker, ticker, type, 'General', `${ticker}.BA`);
    asset.id = `asset-${ticker}`;
    return asset;
  };

  const makeQuote = (date: string, closePrice: number): MarketQuote =>
    new MarketQuote(new Date(date), { closePrice });

  const makeConfigService = (): ConfigService =>
    ({
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'market.backfill.days') return 365;
        if (key === 'market.backfill.perTypeLimit') return 20;
        if (key === 'market.backfill.chunkSize') return 100;
        if (key === 'market.backfill.chunkDelayMs') return 0;
        if (key === 'market.backfill.priorityTickers') return 'GGAL,YPFD';
        return fallback;
      }),
    }) as unknown as ConfigService;

  it('processes top 20 stocks and top 20 cedears and persists daily historical quotes', async () => {
    const stocks = Array.from({ length: 25 }).map((_, index) =>
      makeAsset(`STK${index}`, AssetType.STOCK),
    );
    const cedears = Array.from({ length: 25 }).map((_, index) =>
      makeAsset(`CED${index}`, AssetType.CEDEAR),
    );

    const assetRepository = {
      findAll: jest
        .fn()
        .mockResolvedValueOnce(stocks)
        .mockResolvedValueOnce(cedears),
      findPaginated: jest.fn(),
      findByTicker: jest.fn(),
      search: jest.fn(),
    } as unknown as IAssetRepository;

    const quoteProvider = {
      fetchQuote: jest.fn(),
      fetchBulkQuotes: jest.fn(),
      fetchHistorical: jest
        .fn()
        .mockResolvedValue([
          makeQuote('2026-03-01T00:00:00.000Z', 100),
          makeQuote('2026-03-02T00:00:00.000Z', 105),
        ]),
    } as unknown as IQuoteProvider;

    const quoteRepository = {
      saveBulkQuotes: jest.fn().mockResolvedValue(undefined),
      findByAssetAndPeriod: jest.fn(),
      findLatestByAsset: jest.fn(),
      findLatestTimestamp: jest.fn(),
      findTopMovers: jest.fn(),
    } as unknown as IQuoteRepository;

    const service = new HistoricalBackfillService(
      makeConfigService(),
      assetRepository,
      quoteProvider,
      null,
      quoteRepository,
    );

    const result = await service.runDailyBackfill(referenceDate);

    expect(assetRepository.findAll as jest.Mock).toHaveBeenNthCalledWith(
      1,
      AssetType.STOCK,
    );
    expect(assetRepository.findAll as jest.Mock).toHaveBeenNthCalledWith(
      2,
      AssetType.CEDEAR,
    );
    expect(quoteProvider.fetchHistorical as jest.Mock).toHaveBeenCalledTimes(
      40,
    );
    expect(quoteRepository.saveBulkQuotes as jest.Mock).toHaveBeenCalledTimes(
      40,
    );
    expect(result.processedAssets).toBe(40);
    expect(result.fetchedQuotes).toBe(80);
    expect(result.failedTickers).toHaveLength(0);
  });

  it('uses fallback provider when primary historical provider fails', async () => {
    const asset = makeAsset('GGAL', AssetType.STOCK);

    const assetRepository = {
      findAll: jest
        .fn()
        .mockResolvedValueOnce([asset])
        .mockResolvedValueOnce([]),
      findPaginated: jest.fn(),
      findByTicker: jest.fn(),
      search: jest.fn(),
    } as unknown as IAssetRepository;

    const quoteProvider = {
      fetchQuote: jest.fn(),
      fetchBulkQuotes: jest.fn(),
      fetchHistorical: jest.fn().mockRejectedValue(new Error('primary down')),
    } as unknown as IQuoteProvider;

    const fallbackProvider = {
      fetchQuote: jest.fn(),
      fetchBulkQuotes: jest.fn(),
      fetchHistorical: jest
        .fn()
        .mockResolvedValue([makeQuote('2026-03-02T00:00:00.000Z', 9000)]),
    } as unknown as IQuoteProvider;

    const quoteRepository = {
      saveBulkQuotes: jest.fn().mockResolvedValue(undefined),
      findByAssetAndPeriod: jest.fn(),
      findLatestByAsset: jest.fn(),
      findLatestTimestamp: jest.fn(),
      findTopMovers: jest.fn(),
    } as unknown as IQuoteRepository;

    const service = new HistoricalBackfillService(
      makeConfigService(),
      assetRepository,
      quoteProvider,
      fallbackProvider,
      quoteRepository,
    );

    const result = await service.runDailyBackfill(referenceDate);

    expect(quoteProvider.fetchHistorical as jest.Mock).toHaveBeenCalledTimes(1);
    expect(fallbackProvider.fetchHistorical as jest.Mock).toHaveBeenCalledTimes(
      1,
    );
    expect(quoteRepository.saveBulkQuotes as jest.Mock).toHaveBeenCalledTimes(
      1,
    );
    expect(result.processedAssets).toBe(1);
    expect(result.failedTickers).toHaveLength(0);
  });

  it('tracks failed tickers when providers fail', async () => {
    const asset = makeAsset('YPFD', AssetType.STOCK);

    const assetRepository = {
      findAll: jest
        .fn()
        .mockResolvedValueOnce([asset])
        .mockResolvedValueOnce([]),
      findPaginated: jest.fn(),
      findByTicker: jest.fn(),
      search: jest.fn(),
    } as unknown as IAssetRepository;

    const quoteProvider = {
      fetchQuote: jest.fn(),
      fetchBulkQuotes: jest.fn(),
      fetchHistorical: jest.fn().mockRejectedValue(new Error('primary down')),
    } as unknown as IQuoteProvider;

    const quoteRepository = {
      saveBulkQuotes: jest.fn().mockResolvedValue(undefined),
      findByAssetAndPeriod: jest.fn(),
      findLatestByAsset: jest.fn(),
      findLatestTimestamp: jest.fn(),
      findTopMovers: jest.fn(),
    } as unknown as IQuoteRepository;

    const service = new HistoricalBackfillService(
      makeConfigService(),
      assetRepository,
      quoteProvider,
      null,
      quoteRepository,
    );

    const result = await service.runDailyBackfill(referenceDate);

    expect(quoteRepository.saveBulkQuotes as jest.Mock).not.toHaveBeenCalled();
    expect(result.processedAssets).toBe(0);
    expect(result.failedTickers).toEqual(['YPFD']);
  });
});
