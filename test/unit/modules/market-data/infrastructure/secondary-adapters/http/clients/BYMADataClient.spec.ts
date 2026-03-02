import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BYMADataClient } from '../../../../../../../../src/modules/market-data/infrastructure/secondary-adapters/http/clients/BYMADataClient';
import { ProviderHealthTracker } from '../../../../../../../../src/modules/market-data/application/ProviderHealthTracker';

jest.mock('axios');

describe('BYMADataClient', () => {
  let client: BYMADataClient;
  let tracker: jest.Mocked<ProviderHealthTracker>;

  beforeEach(() => {
    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'market.bymaDataBaseUrl') {
            return 'https://open.bymadata.com.ar';
          }

          return defaultValue;
        }),
    } as unknown as ConfigService;

    tracker = {
      track: jest.fn(async (_provider, _endpoint, operation) => operation()),
    } as unknown as jest.Mocked<ProviderHealthTracker>;

    client = new BYMADataClient(configService, tracker);
  });

  it('maps BYMA response fixture to internal quotes', async () => {
    const fixturePath = join(
      __dirname,
      '..',
      'fixtures',
      'byma-quotes.fixture.json',
    );
    const payload = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;

    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockResolvedValue({
      data: payload,
    });

    const quote = await client.fetchQuote('GGAL.BA');
    const bulk = await client.fetchBulkQuotes([
      'GGAL.BA',
      'YPFD.BA',
      'MISSING.BA',
    ]);

    expect(tracker.track).toHaveBeenCalledWith(
      'open.bymadata.com.ar',
      '/api/market/quotes',
      expect.any(Function),
    );
    expect(quote.closePrice).toBe(7850.5);
    expect(quote.changePct).toBe(1.62);
    expect(quote.volume).toBe(15234567);
    expect(bulk).toHaveLength(2);
  });

  it('throws when response has no usable rows', async () => {
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockResolvedValue({
      data: [{ symbol: 'BAD', close: 0 }],
    });

    await expect(client.fetchQuote('BAD.BA')).rejects.toThrow(
      'BYMA data client returned no usable rows',
    );
  });
});
