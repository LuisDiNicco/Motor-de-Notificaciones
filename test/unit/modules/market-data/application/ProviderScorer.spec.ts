import { ProviderScorer } from '../../../../../src/modules/market-data/application/ProviderScorer';
import { ProviderHealthTracker } from '../../../../../src/modules/market-data/application/ProviderHealthTracker';
import { ProviderCheckStatus } from '../../../../../src/modules/market-data/domain/entities/ProviderHealth';

describe('ProviderScorer', () => {
  it('computes sorted provider scores and confidence levels', async () => {
    const tracker = {
      getProviderHealth: jest.fn().mockResolvedValue({
        updatedAt: new Date('2026-03-02T12:00:00.000Z'),
        providers: [
          {
            providerName: 'data912.com',
            status: ProviderCheckStatus.SUCCESS,
            checks24h: 24,
            uptime24h: 98,
            errorRate1h: 0,
            avgLatencyMs: 180,
            lastCheckedAt: new Date('2026-03-02T11:59:00.000Z'),
            lastSuccessAt: new Date('2026-03-02T11:59:00.000Z'),
            lastFailureAt: null,
          },
          {
            providerName: 'rava.com',
            status: ProviderCheckStatus.FAILURE,
            checks24h: 12,
            uptime24h: 55,
            errorRate1h: 40,
            avgLatencyMs: 1200,
            lastCheckedAt: new Date('2026-03-02T11:00:00.000Z'),
            lastSuccessAt: new Date('2026-03-02T10:20:00.000Z'),
            lastFailureAt: new Date('2026-03-02T11:00:00.000Z'),
          },
        ],
      }),
    } as unknown as ProviderHealthTracker;

    const scorer = new ProviderScorer(tracker);

    const scores = await scorer.scoreProviders();

    expect(scores).toHaveLength(2);
    expect(scores[0]?.providerName).toBe('data912.com');
    expect(scores[0]?.confidence).toBe('HIGH');
    expect(scores[1]?.providerName).toBe('rava.com');
    expect(scores[1]?.confidence).toBe('LOW');
  });
});
