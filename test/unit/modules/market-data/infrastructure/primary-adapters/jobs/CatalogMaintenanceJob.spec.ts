import { LessThan, Repository } from 'typeorm';
import { AssetEntity } from '../../../../../../../src/modules/market-data/infrastructure/secondary-adapters/database/entities/AssetEntity';
import { Data912QuoteClient } from '../../../../../../../src/modules/market-data/infrastructure/secondary-adapters/http/clients/Data912QuoteClient';
import { CatalogMaintenanceJob } from '../../../../../../../src/modules/market-data/infrastructure/primary-adapters/jobs/CatalogMaintenanceJob';

describe('CatalogMaintenanceJob', () => {
  let job: CatalogMaintenanceJob;
  let assetRepository: jest.Mocked<Repository<AssetEntity>>;
  let data912Client: jest.Mocked<Data912QuoteClient>;

  beforeEach(() => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    assetRepository = {
      update: jest.fn().mockResolvedValue({ affected: 2 }),
      find: jest
        .fn()
        .mockResolvedValue([
          { ticker: 'GGAL' } as AssetEntity,
          { ticker: 'AL30' } as AssetEntity,
        ]),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as jest.Mocked<Repository<AssetEntity>>;

    data912Client = {
      fetchAvailableTickers: jest
        .fn()
        .mockResolvedValue(['GGAL', 'AL30', 'PAMP']),
    } as unknown as jest.Mocked<Data912QuoteClient>;

    job = new CatalogMaintenanceJob(assetRepository, data912Client);
  });

  it('deactivates matured assets, checks new tickers and updates catalog check timestamp', async () => {
    await job.handle();

    expect(assetRepository.update).toHaveBeenCalledTimes(1);

    const updateCriteria = assetRepository.update.mock.calls[0]?.[0] as {
      isActive: boolean;
      maturityDate: ReturnType<typeof LessThan>;
    };
    const updateValues = assetRepository.update.mock.calls[0]?.[1] as {
      isActive: boolean;
      lastCatalogCheck: Date;
    };

    expect(updateCriteria.isActive).toBe(true);
    expect(updateCriteria.maturityDate).toBeDefined();
    expect(updateValues.isActive).toBe(false);
    expect(updateValues.lastCatalogCheck).toBeInstanceOf(Date);

    expect(assetRepository.find).toHaveBeenCalledTimes(1);
    expect(data912Client.fetchAvailableTickers).toHaveBeenCalledTimes(1);
    expect(assetRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('handles provider failures without throwing', async () => {
    data912Client.fetchAvailableTickers.mockRejectedValueOnce(
      new Error('provider down'),
    );

    await expect(job.handle()).resolves.toBeUndefined();
  });
});
