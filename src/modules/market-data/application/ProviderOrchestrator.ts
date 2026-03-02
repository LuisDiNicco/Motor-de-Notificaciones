import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  BYMA_QUOTE_PROVIDER,
  QUOTE_FALLBACK_PROVIDER,
  QUOTE_PROVIDER,
  RAVA_QUOTE_PROVIDER,
  type IQuoteProvider,
} from './IQuoteProvider';
import { AssetType } from '../domain/enums/AssetType';
import { MarketQuote } from '../domain/entities/MarketQuote';
import { ProviderScorer, type ProviderConfidence } from './ProviderScorer';

export interface OrchestratedQuote {
  quote: MarketQuote;
  source: string;
  confidence: ProviderConfidence;
  timestamp: Date;
}

@Injectable()
export class ProviderOrchestrator {
  constructor(
    private readonly providerScorer: ProviderScorer,
    @Inject(QUOTE_PROVIDER)
    private readonly primaryQuoteProvider: IQuoteProvider,
    @Optional()
    @Inject(RAVA_QUOTE_PROVIDER)
    private readonly ravaQuoteProvider: IQuoteProvider | null,
    @Optional()
    @Inject(BYMA_QUOTE_PROVIDER)
    private readonly bymaQuoteProvider: IQuoteProvider | null,
    @Optional()
    @Inject(QUOTE_FALLBACK_PROVIDER)
    private readonly fallbackQuoteProvider: IQuoteProvider | null,
  ) {}

  public async fetchQuote(
    assetType: AssetType,
    yahooTicker: string,
  ): Promise<OrchestratedQuote> {
    const scores = await this.providerScorer.scoreProviders();
    const scoreByProvider = new Map(
      scores.map((score) => [score.providerName, score]),
    );

    const providerCandidates = this.getProviderCandidates(assetType)
      .map((providerName) => {
        const provider = this.getProvider(providerName);
        if (!provider) {
          return null;
        }

        const score = scoreByProvider.get(providerName);

        return {
          providerName,
          provider,
          score: score?.score ?? 50,
          confidence: score?.confidence ?? 'MEDIUM',
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          providerName: string;
          provider: IQuoteProvider;
          score: number;
          confidence: ProviderConfidence;
        } => candidate !== null,
      )
      .sort((left, right) => right.score - left.score);

    let lastError: Error | null = null;

    for (const candidate of providerCandidates) {
      try {
        const quote = await candidate.provider.fetchQuote(yahooTicker);

        return {
          quote,
          source: candidate.providerName,
          confidence: candidate.confidence,
          timestamp: new Date(),
        };
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw (
      lastError ??
      new Error(`No provider available for ${assetType} quote ${yahooTicker}`)
    );
  }

  private getProviderCandidates(assetType: AssetType): string[] {
    if (assetType === AssetType.STOCK || assetType === AssetType.CEDEAR) {
      return [
        'data912.com',
        'rava.com',
        'open.bymadata.com.ar',
        'yahoo-finance',
      ];
    }

    if (assetType === AssetType.BOND || assetType === AssetType.ON) {
      return ['data912.com', 'open.bymadata.com.ar', 'yahoo-finance'];
    }

    return ['data912.com', 'yahoo-finance'];
  }

  private getProvider(providerName: string): IQuoteProvider | null {
    switch (providerName) {
      case 'data912.com':
        return this.primaryQuoteProvider;
      case 'rava.com':
        return this.ravaQuoteProvider;
      case 'open.bymadata.com.ar':
        return this.bymaQuoteProvider;
      case 'yahoo-finance':
        return this.fallbackQuoteProvider;
      default:
        return null;
    }
  }
}
