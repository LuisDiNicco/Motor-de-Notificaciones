import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ArgentinaDatosClient } from '../../../../../../../../src/modules/market-data/infrastructure/secondary-adapters/http/clients/ArgentinaDatosClient';
import { ProviderHealthTracker } from '../../../../../../../../src/modules/market-data/application/ProviderHealthTracker';
import { DollarType } from '../../../../../../../../src/modules/market-data/domain/enums/DollarType';

jest.mock('axios');

describe('ArgentinaDatosClient', () => {
  let client: ArgentinaDatosClient;
  let configService: jest.Mocked<ConfigService>;
  let tracker: jest.Mocked<ProviderHealthTracker>;

  beforeEach(() => {
    configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'market.argentinaDatosBaseUrl') {
            return 'https://api.argentinadatos.com/v1';
          }

          return defaultValue;
        }),
    } as unknown as jest.Mocked<ConfigService>;

    tracker = {
      track: jest.fn(async (_provider, _endpoint, operation) => operation()),
    } as unknown as jest.Mocked<ProviderHealthTracker>;

    client = new ArgentinaDatosClient(configService, tracker);
  });

  it('maps dollar rows into domain quotes', async () => {
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          casa: 'oficial',
          compra: 1000,
          venta: 1030,
          fechaActualizacion: '2026-03-02T10:00:00.000Z',
        },
        {
          casa: 'blue',
          compra: 1180,
          venta: 1210,
          fechaActualizacion: '2026-03-02T10:00:00.000Z',
        },
      ],
    });

    const quotes = await client.fetchDollarQuotes();

    expect(tracker.track).toHaveBeenCalledWith(
      'api.argentinadatos.com',
      '/cotizaciones/dolares',
      expect.any(Function),
    );
    expect(quotes).toHaveLength(2);
    expect(quotes[0]?.type).toBe(DollarType.OFICIAL);
    expect(quotes[1]?.type).toBe(DollarType.BLUE);
    expect(quotes[0]?.source).toBe('argentinadatos.com');
  });

  it('maps aliases and filters malformed rows', async () => {
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          nombre: 'mep',
          compra: '1.100,50',
          venta: '1.120,50',
          fecha: '2026-03-02T10:00:00.000Z',
        },
        {
          casa: 'unknown',
          compra: 1000,
          venta: 1010,
        },
        {
          casa: 'blue',
          compra: 0,
          venta: 1200,
        },
      ],
    });

    const quotes = await client.fetchDollarQuotes();

    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.type).toBe(DollarType.MEP);
    expect(quotes[0]?.buyPrice).toBe(1100.5);
    expect(quotes[0]?.sellPrice).toBe(1120.5);
  });
});
