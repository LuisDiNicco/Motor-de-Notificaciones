import { ProviderOrchestrator } from '../../../../../src/modules/market-data/application/ProviderOrchestrator';
import { ProviderScorer } from '../../../../../src/modules/market-data/application/ProviderScorer';
import { MarketQuote } from '../../../../../src/modules/market-data/domain/entities/MarketQuote';
import { AssetType } from '../../../../../src/modules/market-data/domain/enums/AssetType';
import { type IQuoteProvider } from '../../../../../src/modules/market-data/application/IQuoteProvider';

describe('ProviderOrchestrator', () => {
  it('selects highest scored provider and falls back on failure', async () => {
    const scorer = {
      scoreProviders: jest.fn().mockResolvedValue([
        { providerName: 'rava.com', score: 90, confidence: 'HIGH' as const },
        {
          providerName: 'data912.com',
          score: 80,
          confidence: 'HIGH' as const,
        },
      ]),
    } as unknown as ProviderScorer;

    const primaryProvider = {
      fetchQuote: jest.fn().mockResolvedValue(
        new MarketQuote(new Date('2026-03-02T12:00:00.000Z'), {
          closePrice: 7850,
          priceArs: 7850,
        }),
      ),
    } as unknown as IQuoteProvider;

    const ravaProvider = {
      fetchQuote: jest.fn().mockRejectedValue(new Error('scraper down')),
    } as unknown as IQuoteProvider;

    const orchestrator = new ProviderOrchestrator(
      scorer,
      primaryProvider,
      ravaProvider,
      null,
      null,
    );

    const result = await orchestrator.fetchQuote(AssetType.STOCK, 'GGAL.BA');

    expect(result.source).toBe('data912.com');
    expect(result.confidence).toBe('HIGH');
    expect(result.quote.closePrice).toBe(7850);
  });
});
