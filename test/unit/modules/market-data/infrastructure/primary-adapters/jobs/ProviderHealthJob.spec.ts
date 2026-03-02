import { ProviderHealthJob } from '../../../../../../../src/modules/market-data/infrastructure/primary-adapters/jobs/ProviderHealthJob';
import { ProviderHealthTracker } from '../../../../../../../src/modules/market-data/application/ProviderHealthTracker';

describe('ProviderHealthJob', () => {
  let job: ProviderHealthJob;
  let tracker: jest.Mocked<ProviderHealthTracker>;

  beforeEach(() => {
    tracker = {
      track: jest.fn(),
      getProviderHealth: jest.fn(),
      refreshRollingMetrics: jest.fn(),
      cleanupStaleChecks: jest.fn(),
    } as unknown as jest.Mocked<ProviderHealthTracker>;

    tracker.refreshRollingMetrics.mockResolvedValue([
      {
        providerName: 'data912.com',
        status: 'SUCCESS',
        checks24h: 10,
        uptime24h: 90,
        errorRate1h: 0,
        avgLatencyMs: 100,
        lastCheckedAt: new Date(),
        lastSuccessAt: new Date(),
        lastFailureAt: null,
      },
    ]);
    tracker.cleanupStaleChecks.mockResolvedValue(2);

    job = new ProviderHealthJob(tracker);
  });

  it('refreshes rolling metrics and removes stale checks', async () => {
    await job.handle();

    expect(tracker.refreshRollingMetrics).toHaveBeenCalledTimes(1);
    expect(tracker.cleanupStaleChecks).toHaveBeenCalledTimes(1);
  });
});
