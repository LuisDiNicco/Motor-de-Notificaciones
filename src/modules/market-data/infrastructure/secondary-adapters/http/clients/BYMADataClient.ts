import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { type IQuoteProvider } from '../../../../application/IQuoteProvider';
import { ProviderHealthTracker } from '../../../../application/ProviderHealthTracker';
import { MarketQuote } from '../../../../domain/entities/MarketQuote';

interface BymaQuoteRow {
  symbol?: string;
  ticker?: string;
  especie?: string;
  last?: number | string;
  close?: number | string;
  ultimo?: number | string;
  variation?: number | string;
  changePct?: number | string;
  volume?: number | string;
  amount?: number | string;
}

@Injectable()
export class BYMADataClient implements IQuoteProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerHealthTracker: ProviderHealthTracker,
  ) {
    this.baseUrl = this.configService.get<string>(
      'market.bymaDataBaseUrl',
      'https://open.bymadata.com.ar',
    );
  }

  public async fetchQuote(yahooTicker: string): Promise<MarketQuote> {
    const symbol = this.normalizeSymbol(yahooTicker);
    const snapshot = await this.fetchSnapshot();
    const row = snapshot.get(symbol);

    if (!row) {
      throw new Error(`BYMA quote not found for symbol ${symbol}`);
    }

    return this.toMarketQuote(row);
  }

  public async fetchHistorical(
    yahooTicker: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MarketQuote[]> {
    void startDate;
    void endDate;

    const latest = await this.fetchQuote(yahooTicker);
    return [latest];
  }

  public async fetchBulkQuotes(yahooTickers: string[]): Promise<MarketQuote[]> {
    const snapshot = await this.fetchSnapshot();

    return yahooTickers
      .map((ticker) => {
        const symbol = this.normalizeSymbol(ticker);
        const row = snapshot.get(symbol);
        return row ? this.toMarketQuote(row) : null;
      })
      .filter((quote): quote is MarketQuote => quote !== null);
  }

  private async fetchSnapshot(): Promise<Map<string, BymaQuoteRow>> {
    const endpoint = '/api/market/quotes';

    const response = await this.providerHealthTracker.track(
      'open.bymadata.com.ar',
      endpoint,
      () =>
        axios.get<BymaQuoteRow[]>(`${this.baseUrl}${endpoint}`, {
          timeout: 8000,
        }),
    );

    const rows = Array.isArray(response.data) ? response.data : [];
    const parsed = rows.filter((row) => {
      const symbol = this.resolveSymbol(row);
      const closePrice = this.resolveClosePrice(row);

      return Boolean(symbol) && closePrice > 0;
    });

    if (parsed.length === 0) {
      throw new Error('BYMA data client returned no usable rows');
    }

    return new Map(parsed.map((row) => [this.resolveSymbol(row)!, row]));
  }

  private toMarketQuote(row: BymaQuoteRow): MarketQuote {
    const closePrice = this.resolveClosePrice(row);

    return new MarketQuote(new Date(), {
      closePrice,
      priceArs: closePrice,
      changePct: this.resolveChangePct(row),
      volume: this.resolveVolume(row),
      openPrice: null,
      highPrice: null,
      lowPrice: null,
      priceUsd: null,
    });
  }

  private resolveSymbol(row: BymaQuoteRow): string | null {
    const raw = row.symbol ?? row.ticker ?? row.especie;
    if (!raw) {
      return null;
    }

    const normalized = String(raw).trim().toUpperCase().replace('.BA', '');
    return normalized.length > 0 ? normalized : null;
  }

  private resolveClosePrice(row: BymaQuoteRow): number {
    return this.parseNumber(row.close ?? row.last ?? row.ultimo);
  }

  private resolveChangePct(row: BymaQuoteRow): number | null {
    const change = this.parseNumber(row.changePct ?? row.variation);
    return Number.isFinite(change) ? change : null;
  }

  private resolveVolume(row: BymaQuoteRow): number | null {
    const volume = this.parseNumber(row.volume ?? row.amount);
    return volume > 0 ? volume : null;
  }

  private normalizeSymbol(value: string): string {
    return value.replace('.BA', '').trim().toUpperCase();
  }

  private parseNumber(value: number | string | undefined): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const cleaned = value.replace(/\s/g, '');
      if (!cleaned) {
        return 0;
      }

      let normalized = cleaned;
      if (cleaned.includes(',') && cleaned.includes('.')) {
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
      } else if (cleaned.includes(',')) {
        normalized = cleaned.replace(',', '.');
      } else if (cleaned.split('.').length > 2) {
        normalized = cleaned.replace(/\./g, '');
      }

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }
}
