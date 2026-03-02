export enum ProviderCheckStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

export class ProviderHealth {
  public id?: string;

  constructor(
    public readonly providerName: string,
    public readonly status: ProviderCheckStatus,
    public readonly latencyMs: number,
    public readonly checkedAt: Date,
    public readonly endpoint: string | null = null,
    public readonly errorMessage: string | null = null,
  ) {}
}

export interface ProviderHealthSummary {
  providerName: string;
  status: ProviderCheckStatus | 'UNKNOWN';
  checks24h: number;
  uptime24h: number;
  errorRate1h: number;
  avgLatencyMs: number | null;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
}
