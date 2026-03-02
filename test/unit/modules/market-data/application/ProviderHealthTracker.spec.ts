import { ProviderHealthTracker } from '../../../../../src/modules/market-data/application/ProviderHealthTracker';
import { IProviderHealthRepository } from '../../../../../src/modules/market-data/application/IProviderHealthRepository';
import {
  ProviderCheckStatus,
  ProviderHealth,
  ProviderHealthSummary,
} from '../../../../../src/modules/market-data/domain/entities/ProviderHealth';

describe('ProviderHealthTracker', () => {
  let tracker: ProviderHealthTracker;
  let repository: jest.Mocked<IProviderHealthRepository>;

  beforeEach(() => {
    repository = {
      saveCheck: jest.fn(),
      getProviderSummaries: jest.fn(),
      deleteOlderThan: jest.fn(),
    };

    tracker = new ProviderHealthTracker(repository);
  });

  it('records success checks when tracked operation resolves', async () => {
    const result = await tracker.track(
      'data912.com',
      '/live/arg_stocks',
      async () => {
        return 42;
      },
    );

    expect(result).toBe(42);
    expect(repository.saveCheck).toHaveBeenCalledTimes(1);
    const savedRecord = repository.saveCheck.mock
      .calls[0]?.[0] as ProviderHealth;
    expect(savedRecord.providerName).toBe('data912.com');
    expect(savedRecord.status).toBe(ProviderCheckStatus.SUCCESS);
    expect(savedRecord.endpoint).toBe('/live/arg_stocks');
    expect(savedRecord.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('records failure checks when tracked operation rejects', async () => {
    await expect(
      tracker.track('data912.com', '/live/arg_stocks', async () => {
        throw new Error('timeout');
      }),
    ).rejects.toThrow('timeout');

    expect(repository.saveCheck).toHaveBeenCalledTimes(1);
    const savedRecord = repository.saveCheck.mock
      .calls[0]?.[0] as ProviderHealth;
    expect(savedRecord.providerName).toBe('data912.com');
    expect(savedRecord.status).toBe(ProviderCheckStatus.FAILURE);
    expect(savedRecord.errorMessage).toBe('timeout');
  });

  it('returns all registered providers including unknown ones without checks', async () => {
    const summary: ProviderHealthSummary = {
      providerName: 'data912.com',
      status: ProviderCheckStatus.SUCCESS,
      checks24h: 5,
      uptime24h: 80,
      errorRate1h: 0,
      avgLatencyMs: 120,
      lastCheckedAt: new Date('2026-03-02T10:00:00.000Z'),
      lastSuccessAt: new Date('2026-03-02T10:00:00.000Z'),
      lastFailureAt: null,
    };

    repository.getProviderSummaries.mockResolvedValue([summary]);

    const providers = await tracker.refreshRollingMetrics();

    const known = providers.find((item) => item.providerName === 'data912.com');
    const unknown = providers.find(
      (item) => item.providerName === 'api.argentinadatos.com',
    );

    expect(known?.status).toBe(ProviderCheckStatus.SUCCESS);
    expect(unknown?.status).toBe('UNKNOWN');
    expect(unknown?.checks24h).toBe(0);
  });
});
