import { MarketQuote } from 'src/modules/market-data/domain/entities/MarketQuote';

describe('MarketQuote', () => {
  it('keeps enrichment fields when assigning asset id', () => {
    const sourceTimestamp = new Date('2026-03-02T11:00:00.000Z');
    const quote = new MarketQuote(new Date('2026-03-02T10:00:00.000Z'), {
      closePrice: 1200,
      source: 'data912.com',
      sourceTimestamp,
      confidence: 'HIGH',
    });

    const quoteWithAsset = quote.withAssetId('asset-1');

    expect(quoteWithAsset.assetId).toBe('asset-1');
    expect(quoteWithAsset.source).toBe('data912.com');
    expect(quoteWithAsset.sourceTimestamp?.toISOString()).toBe(
      sourceTimestamp.toISOString(),
    );
    expect(quoteWithAsset.confidence).toBe('HIGH');
  });

  it('supports backward compatible quotes without enrichment', () => {
    const quote = new MarketQuote(new Date('2026-03-02T10:00:00.000Z'), {
      closePrice: 1200,
    });

    expect(quote.source).toBeNull();
    expect(quote.sourceTimestamp).toBeNull();
    expect(quote.confidence).toBeNull();
  });
});
