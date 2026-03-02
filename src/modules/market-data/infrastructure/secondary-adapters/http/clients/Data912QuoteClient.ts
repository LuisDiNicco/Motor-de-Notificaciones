import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { type IQuoteProvider } from '../../../../application/IQuoteProvider';
import { ProviderHealthTracker } from '../../../../application/ProviderHealthTracker';
import { MarketQuote } from '../../../../domain/entities/MarketQuote';

interface Data912QuoteRow {
  symbol: string;
  v?: number;
  c?: number;
  pct_change?: number;
  px_bid?: number;
  px_ask?: number;
}

interface SnapshotCache {
  expiresAt: number;
  quotesBySymbol: Map<string, Data912QuoteRow>;
}

@Injectable()
export class Data912QuoteClient implements IQuoteProvider {
  private static readonly SNAPSHOT_TTL_MS = 30_000;
  private readonly endpoints = [
    'https://data912.com/live/arg_stocks',
    'https://data912.com/live/arg_cedears',
    'https://data912.com/live/arg_bonds',
    'https://data912.com/live/arg_corp',
  ];

  private snapshotCache: SnapshotCache = {
    expiresAt: 0,
    quotesBySymbol: new Map(),
  };

  constructor(private readonly providerHealthTracker: ProviderHealthTracker) {}

  public async fetchQuote(yahooTicker: string): Promise<MarketQuote> {
    const symbol = this.normalizeSymbol(yahooTicker);
    const snapshot = await this.getSnapshot();
    const row = snapshot.quotesBySymbol.get(symbol);

    if (!row) {
      throw new Error(`Data912 quote not found for symbol ${symbol}`);
    }

    const marketPrice = this.toNullableNumber(row.c);
    const bid = this.toNullableNumber(row.px_bid);
    const ask = this.toNullableNumber(row.px_ask);
    const fallbackMidPrice =
      bid != null && ask != null ? (bid + ask) / 2 : (bid ?? ask);

    return new MarketQuote(new Date(), {
      closePrice: marketPrice ?? fallbackMidPrice,
      priceArs: marketPrice ?? fallbackMidPrice,
      volume: this.toNullableNumber(row.v),
      changePct: this.toNullableNumber(row.pct_change),
      openPrice: null,
      highPrice: null,
      lowPrice: null,
      priceUsd: null,
    });
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
    const snapshot = await this.getSnapshot();

    const quotes = yahooTickers.map((ticker) => {
      const symbol = this.normalizeSymbol(ticker);
      const row = snapshot.quotesBySymbol.get(symbol);

      if (!row) {
        return null;
      }

      const marketPrice = this.toNullableNumber(row.c);
      const bid = this.toNullableNumber(row.px_bid);
      const ask = this.toNullableNumber(row.px_ask);
      const fallbackMidPrice =
        bid != null && ask != null ? (bid + ask) / 2 : (bid ?? ask);

      return new MarketQuote(new Date(), {
        closePrice: marketPrice ?? fallbackMidPrice,
        priceArs: marketPrice ?? fallbackMidPrice,
        volume: this.toNullableNumber(row.v),
        changePct: this.toNullableNumber(row.pct_change),
        openPrice: null,
        highPrice: null,
        lowPrice: null,
        priceUsd: null,
      });
    });

    return quotes.filter((quote): quote is MarketQuote => quote !== null);
  }

  private async getSnapshot(): Promise<SnapshotCache> {
    if (
      Date.now() < this.snapshotCache.expiresAt &&
      this.snapshotCache.quotesBySymbol.size > 0
    ) {
      return this.snapshotCache;
    }

    const responses = await Promise.allSettled(
      this.endpoints.map((url) =>
        this.providerHealthTracker.track('data912.com', url, () =>
          axios.get<Data912QuoteRow[]>(url, {
            timeout: 8_000,
          }),
        ),
      ),
    );

    const quotesBySymbol = new Map<string, Data912QuoteRow>();
    let successfulSources = 0;

    for (const response of responses) {
      if (response.status !== 'fulfilled') {
        continue;
      }

      successfulSources += 1;

      for (const row of response.value.data) {
        if (!row?.symbol) {
          continue;
        }

        if (!this.hasUsablePrice(row)) {
          continue;
        }

        quotesBySymbol.set(row.symbol.toUpperCase(), row);
      }
    }

    if (successfulSources === 0 || quotesBySymbol.size === 0) {
      throw new Error('No quote snapshot could be built from Data912 sources');
    }

    this.snapshotCache = {
      expiresAt: Date.now() + Data912QuoteClient.SNAPSHOT_TTL_MS,
      quotesBySymbol,
    };

    return this.snapshotCache;
  }

  private normalizeSymbol(yahooTicker: string): string {
    return yahooTicker.replace('.BA', '').toUpperCase();
  }

  private toNullableNumber(value?: number): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }

    return value;
  }

  private hasUsablePrice(row: Data912QuoteRow): boolean {
    const close = this.toNullableNumber(row.c);
    const bid = this.toNullableNumber(row.px_bid);
    const ask = this.toNullableNumber(row.px_ask);

    return (
      (typeof close === 'number' && close > 0) ||
      (typeof bid === 'number' && bid > 0) ||
      (typeof ask === 'number' && ask > 0)
    );
  }
}
