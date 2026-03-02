import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { type IQuoteProvider } from '../../../../application/IQuoteProvider';
import { ProviderHealthTracker } from '../../../../application/ProviderHealthTracker';
import { MarketQuote } from '../../../../domain/entities/MarketQuote';

interface AlphaVantageGlobalQuote {
  '02. open'?: string;
  '03. high'?: string;
  '04. low'?: string;
  '05. price'?: string;
  '06. volume'?: string;
  '10. change percent'?: string;
}

interface AlphaVantageResponse {
  'Global Quote'?: AlphaVantageGlobalQuote;
}

@Injectable()
export class AlphaVantageClient implements IQuoteProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://www.alphavantage.co/query';

  constructor(
    private readonly configService: ConfigService,
    private readonly providerHealthTracker: ProviderHealthTracker,
  ) {
    this.apiKey = this.configService.get<string>(
      'market.alphaVantageApiKey',
      '',
    );
  }

  public async fetchQuote(yahooTicker: string): Promise<MarketQuote> {
    if (!this.apiKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY is not configured');
    }

    const symbol = this.toAlphaSymbol(yahooTicker);
    const { data } = await this.providerHealthTracker.track(
      'alphavantage.co',
      '/query',
      () =>
        axios.get<AlphaVantageResponse>(this.baseUrl, {
          params: {
            function: 'GLOBAL_QUOTE',
            symbol,
            apikey: this.apiKey,
          },
        }),
    );

    const quote = data['Global Quote'];
    if (!quote) {
      throw new Error(`AlphaVantage did not return quote for symbol ${symbol}`);
    }

    const now = new Date();

    return new MarketQuote(now, {
      openPrice: this.toNullableNumber(quote['02. open']),
      highPrice: this.toNullableNumber(quote['03. high']),
      lowPrice: this.toNullableNumber(quote['04. low']),
      closePrice: this.toNullableNumber(quote['05. price']),
      volume: this.toNullableNumber(quote['06. volume']),
      changePct: this.toNullablePercent(quote['10. change percent']),
    });
  }

  public fetchHistorical(
    yahooTicker: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MarketQuote[]> {
    void yahooTicker;
    void startDate;
    void endDate;
    return Promise.resolve([]);
  }

  public async fetchBulkQuotes(yahooTickers: string[]): Promise<MarketQuote[]> {
    const quotes = await Promise.all(
      yahooTickers.map(async (ticker) => {
        try {
          return await this.fetchQuote(ticker);
        } catch {
          return null;
        }
      }),
    );

    return quotes.filter((quote): quote is MarketQuote => quote !== null);
  }

  private toAlphaSymbol(yahooTicker: string): string {
    return yahooTicker.replace('.BA', '');
  }

  private toNullableNumber(value?: string): number | null {
    if (!value) {
      return null;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private toNullablePercent(value?: string): number | null {
    if (!value) {
      return null;
    }

    const normalized = value.replace('%', '');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
}
