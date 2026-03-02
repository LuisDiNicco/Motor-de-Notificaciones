import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ProviderHealthTracker } from '../../../../application/ProviderHealthTracker';
import { DollarQuote } from '../../../../domain/entities/DollarQuote';
import { DollarType } from '../../../../domain/enums/DollarType';

interface ArgentinaDatosDollarRow {
  casa?: string;
  nombre?: string;
  compra?: number | string;
  venta?: number | string;
  fechaActualizacion?: string;
  fecha?: string;
}

@Injectable()
export class ArgentinaDatosClient {
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerHealthTracker: ProviderHealthTracker,
  ) {
    this.baseUrl = this.configService.get<string>(
      'market.argentinaDatosBaseUrl',
      'https://api.argentinadatos.com/v1',
    );
  }

  public async fetchDollarQuotes(): Promise<DollarQuote[]> {
    const response = await this.providerHealthTracker.track(
      'api.argentinadatos.com',
      '/cotizaciones/dolares',
      () =>
        axios.get<ArgentinaDatosDollarRow[]>(
          `${this.baseUrl}/cotizaciones/dolares`,
          {
            timeout: 5000,
          },
        ),
    );

    return response.data
      .map((row) => {
        const type = this.toDollarType(row.casa ?? row.nombre ?? '');
        if (!type) {
          return null;
        }

        const buyPrice = this.parseNumber(row.compra);
        const sellPrice = this.parseNumber(row.venta);
        if (buyPrice <= 0 || sellPrice <= 0) {
          return null;
        }

        return new DollarQuote(
          type,
          buyPrice,
          sellPrice,
          this.parseDate(row.fechaActualizacion ?? row.fecha),
          'argentinadatos.com',
        );
      })
      .filter((quote): quote is DollarQuote => quote !== null);
  }

  private toDollarType(rawType: string): DollarType | null {
    const normalized = rawType.trim().toLowerCase();

    switch (normalized) {
      case 'oficial':
        return DollarType.OFICIAL;
      case 'blue':
        return DollarType.BLUE;
      case 'bolsa':
      case 'mep':
        return DollarType.MEP;
      case 'contadoconliqui':
      case 'contado con liqui':
      case 'ccl':
        return DollarType.CCL;
      case 'tarjeta':
        return DollarType.TARJETA;
      case 'cripto':
        return DollarType.CRIPTO;
      default:
        return null;
    }
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

  private parseDate(value?: string): Date {
    if (!value) {
      return new Date();
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }

    return parsed;
  }
}
