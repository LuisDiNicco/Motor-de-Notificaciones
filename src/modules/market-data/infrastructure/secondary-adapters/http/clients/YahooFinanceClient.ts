import { Injectable } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';
import { type IQuoteProvider } from '../../../../application/IQuoteProvider';
import { ProviderHealthTracker } from '../../../../application/ProviderHealthTracker';
import { MarketQuote } from '../../../../domain/entities/MarketQuote';

const yahooFinance = new YahooFinance();

interface YahooQuoteLike {
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPrice?: number;
  regularMarketVolume?: number;
  regularMarketChangePercent?: number;
}

interface YahooHistoricalLike {
  date?: Date;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

@Injectable()
export class YahooFinanceClient implements IQuoteProvider {
  constructor(private readonly providerHealthTracker: ProviderHealthTracker) {}

  public async fetchQuote(yahooTicker: string): Promise<MarketQuote> {
    const quote = await this.providerHealthTracker.track(
      'yahoo-finance',
      `quote:${yahooTicker}`,
      async () =>
        (await Promise.resolve(
          yahooFinance.quote(yahooTicker),
        )) as YahooQuoteLike,
    );
    const now = new Date();

    return new MarketQuote(now, {
      openPrice: this.toNullableNumber(quote.regularMarketOpen),
      highPrice: this.toNullableNumber(quote.regularMarketDayHigh),
      lowPrice: this.toNullableNumber(quote.regularMarketDayLow),
      closePrice: this.toNullableNumber(quote.regularMarketPrice),
      volume: this.toNullableNumber(quote.regularMarketVolume),
      changePct: this.toNullableNumber(quote.regularMarketChangePercent),
    });
  }

  public async fetchHistorical(
    yahooTicker: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MarketQuote[]> {
    const historical = await this.providerHealthTracker.track(
      'yahoo-finance',
      `historical:${yahooTicker}`,
      async () =>
        (await Promise.resolve(
          yahooFinance.historical(yahooTicker, {
            period1: startDate,
            period2: endDate,
            interval: '1d',
          }),
        )) as YahooHistoricalLike[],
    );

    return historical
      .filter((item) => item.date instanceof Date)
      .map(
        (item) =>
          new MarketQuote(item.date as Date, {
            openPrice: this.toNullableNumber(item.open),
            highPrice: this.toNullableNumber(item.high),
            lowPrice: this.toNullableNumber(item.low),
            closePrice: this.toNullableNumber(item.close),
            volume: this.toNullableNumber(item.volume),
          }),
      );
  }

  public async fetchBulkQuotes(yahooTickers: string[]): Promise<MarketQuote[]> {
    const quoteRequests = yahooTickers.map(async (ticker) => {
      try {
        return await this.fetchQuote(ticker);
      } catch {
        return null;
      }
    });

    const quotes = await Promise.all(quoteRequests);
    return quotes.filter((quote): quote is MarketQuote => quote !== null);
  }

  private toNullableNumber(value?: number): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }

    return value;
  }
}
