import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ProviderHealthTracker } from '../../../../application/ProviderHealthTracker';

interface BcraReferenceResponse {
  results?: Array<{
    valor?: number | string;
    value?: number | string;
  }>;
  value?: number | string;
  valor?: number | string;
}

@Injectable()
export class BCRAClient {
  private readonly baseUrl: string;
  private readonly endpointPath = '/estadisticas/v3.0/Monetarias/5';

  constructor(
    private readonly configService: ConfigService,
    private readonly providerHealthTracker: ProviderHealthTracker,
  ) {
    this.baseUrl = this.configService.get<string>(
      'market.bcraApiBaseUrl',
      'https://api.bcra.gob.ar',
    );
  }

  public async fetchOfficialReference(): Promise<number> {
    const response = await this.providerHealthTracker.track(
      'api.bcra.gob.ar',
      this.endpointPath,
      () =>
        axios.get<BcraReferenceResponse>(
          `${this.baseUrl}${this.endpointPath}`,
          {
            timeout: 5000,
          },
        ),
    );

    const directValue = this.parseNumber(
      response.data.value ?? response.data.valor,
    );

    if (directValue > 0) {
      return directValue;
    }

    const results = Array.isArray(response.data.results)
      ? response.data.results
      : [];
    const latest = results[results.length - 1];
    const latestValue = this.parseNumber(latest?.valor ?? latest?.value);

    if (latestValue <= 0) {
      throw new Error('BCRA reference value is unavailable');
    }

    return latestValue;
  }

  private parseNumber(value: number | string | undefined): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const normalized = value.includes(',')
        ? value.replace(/\./g, '').replace(',', '.').trim()
        : value.trim();
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }
}
