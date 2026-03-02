import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BCRAClient } from '../../../../../../../../src/modules/market-data/infrastructure/secondary-adapters/http/clients/BCRAClient';
import { ProviderHealthTracker } from '../../../../../../../../src/modules/market-data/application/ProviderHealthTracker';

jest.mock('axios');

describe('BCRAClient', () => {
  let client: BCRAClient;
  let configService: jest.Mocked<ConfigService>;
  let tracker: jest.Mocked<ProviderHealthTracker>;

  beforeEach(() => {
    configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'market.bcraApiBaseUrl') {
            return 'https://api.bcra.gob.ar';
          }

          return defaultValue;
        }),
    } as unknown as jest.Mocked<ConfigService>;

    tracker = {
      track: jest.fn(async (_provider, _endpoint, operation) => operation()),
    } as unknown as jest.Mocked<ProviderHealthTracker>;

    client = new BCRAClient(configService, tracker);
  });

  it('returns latest value from results payload', async () => {
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockResolvedValue({
      data: {
        results: [{ valor: 1000 }, { valor: 1015.5 }],
      },
    });

    const value = await client.fetchOfficialReference();

    expect(value).toBe(1015.5);
    expect(tracker.track).toHaveBeenCalledWith(
      'api.bcra.gob.ar',
      '/estadisticas/v3.0/Monetarias/5',
      expect.any(Function),
    );
  });
});
