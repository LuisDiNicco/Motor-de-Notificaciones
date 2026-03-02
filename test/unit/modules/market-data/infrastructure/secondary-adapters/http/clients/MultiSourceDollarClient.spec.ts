import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MultiSourceDollarClient } from '../../../../../../../../src/modules/market-data/infrastructure/secondary-adapters/http/clients/MultiSourceDollarClient';
import { ProviderHealthTracker } from '../../../../../../../../src/modules/market-data/application/ProviderHealthTracker';
import { ArgentinaDatosClient } from '../../../../../../../../src/modules/market-data/infrastructure/secondary-adapters/http/clients/ArgentinaDatosClient';
import { BCRAClient } from '../../../../../../../../src/modules/market-data/infrastructure/secondary-adapters/http/clients/BCRAClient';
import { DollarQuote } from '../../../../../../../../src/modules/market-data/domain/entities/DollarQuote';
import { DollarType } from '../../../../../../../../src/modules/market-data/domain/enums/DollarType';

jest.mock('axios');

describe('MultiSourceDollarClient', () => {
  let client: MultiSourceDollarClient;
  let configService: jest.Mocked<ConfigService>;
  let tracker: jest.Mocked<ProviderHealthTracker>;
  let argentinaDatosClient: jest.Mocked<ArgentinaDatosClient>;
  let bcraClient: jest.Mocked<BCRAClient>;

  beforeEach(() => {
    configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'market.dolarApiUrl') {
            return 'https://dolarapi.com/v1';
          }

          if (key === 'market.bluelyticsUrl') {
            return 'https://api.bluelytics.com.ar/v2';
          }

          if (key === 'market.criptoYaUrl') {
            return 'https://criptoya.com/api';
          }

          if (key === 'market.dollarConsensusMaxDeviationPct') {
            return 8;
          }

          if (key === 'market.dollarSourceMaxAgeMinutes') {
            return 60;
          }

          if (key === 'market.dollarCrossValidationThresholdPercent') {
            return 2;
          }

          return defaultValue;
        }),
    } as unknown as jest.Mocked<ConfigService>;

    tracker = {
      track: jest.fn(async (_provider, _endpoint, operation) => operation()),
    } as unknown as jest.Mocked<ProviderHealthTracker>;

    argentinaDatosClient = {
      fetchDollarQuotes: jest.fn(),
    } as unknown as jest.Mocked<ArgentinaDatosClient>;

    bcraClient = {
      fetchOfficialReference: jest.fn(),
    } as unknown as jest.Mocked<BCRAClient>;

    client = new MultiSourceDollarClient(
      configService,
      tracker,
      argentinaDatosClient,
      bcraClient,
    );
  });

  it('builds consensus with ArgentinaDatos and validates official against BCRA', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const now = new Date('2026-03-02T12:00:00.000Z');
    const mockedAxios = axios as jest.Mocked<typeof axios>;
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url.includes('/dolares')) {
        return {
          data: [
            {
              casa: 'oficial',
              compra: 1000,
              venta: 1020,
              fechaActualizacion: now.toISOString(),
            },
            {
              casa: 'blue',
              compra: 1180,
              venta: 1210,
              fechaActualizacion: now.toISOString(),
            },
          ],
        };
      }

      if (url.includes('/latest')) {
        return {
          data: {
            oficial: { value_buy: 1005, value_sell: 1025 },
            blue: { value_buy: 1185, value_sell: 1215 },
            last_update: now.toISOString(),
          },
        };
      }

      return {
        data: {
          oficial: { bid: 1002, ask: 1022, timestamp: now.getTime() / 1000 },
          blue: { bid: 1182, ask: 1212, timestamp: now.getTime() / 1000 },
          tarjeta: { price: 1600, timestamp: now.getTime() / 1000 },
          cripto: {
            usdt: { bid: 1200, ask: 1220, timestamp: now.getTime() / 1000 },
          },
          mep: {
            al30: { ci: { price: 1120, timestamp: now.getTime() / 1000 } },
          },
          ccl: {
            al30: { ci: { price: 1150, timestamp: now.getTime() / 1000 } },
          },
        },
      };
    });

    argentinaDatosClient.fetchDollarQuotes.mockResolvedValue([
      new DollarQuote(DollarType.OFICIAL, 995, 1015, now, 'argentinadatos.com'),
      new DollarQuote(DollarType.BLUE, 1179, 1211, now, 'argentinadatos.com'),
    ]);
    bcraClient.fetchOfficialReference.mockResolvedValue(1100);

    const result = await client.fetchAllDollarQuotes();

    const official = result.find((quote) => quote.type === DollarType.OFICIAL);

    expect(argentinaDatosClient.fetchDollarQuotes).toHaveBeenCalledTimes(1);
    expect(bcraClient.fetchOfficialReference).toHaveBeenCalledTimes(1);
    expect(official).toBeDefined();
    expect(official?.source).toContain('consensus');
    expect(
      warnSpy.mock.calls.some((call) =>
        String(call[0]).includes('cross-validation deviation'),
      ),
    ).toBe(true);

    warnSpy.mockRestore();
  });
});
