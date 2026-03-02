import { Inject, Injectable } from '@nestjs/common';
import { PROVIDER_HEALTH_REPOSITORY } from './IProviderHealthRepository';
import type { IProviderHealthRepository } from './IProviderHealthRepository';
import {
  ProviderCheckStatus,
  ProviderHealth,
  ProviderHealthSummary,
} from '../domain/entities/ProviderHealth';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ProviderHealthTracker {
  private readonly registeredProviders = [
    'dolarapi.com',
    'bluelytics.com',
    'criptoya.com',
    'api.argentinadatos.com',
    'api.bcra.gob.ar',
    'mercados.ambito.com',
    'data912.com',
    'rava.com',
    'open.bymadata.com.ar',
    'yahoo-finance',
    'alphavantage.co',
  ];

  private cachedSnapshot: {
    updatedAt: Date;
    providers: ProviderHealthSummary[];
  } | null = null;

  constructor(
    @Inject(PROVIDER_HEALTH_REPOSITORY)
    private readonly providerHealthRepository: IProviderHealthRepository,
  ) {}

  public async track<T>(
    providerName: string,
    endpoint: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();

    try {
      const result = await operation();
      await this.providerHealthRepository.saveCheck(
        new ProviderHealth(
          providerName,
          ProviderCheckStatus.SUCCESS,
          Date.now() - startedAt,
          new Date(),
          endpoint,
          null,
        ),
      );

      return result;
    } catch (error) {
      const normalizedError = error as Error;

      await this.providerHealthRepository.saveCheck(
        new ProviderHealth(
          providerName,
          ProviderCheckStatus.FAILURE,
          Date.now() - startedAt,
          new Date(),
          endpoint,
          normalizedError.message.slice(0, 255),
        ),
      );

      throw error;
    }
  }

  public async getProviderHealth(
    useCache = true,
  ): Promise<{ updatedAt: Date; providers: ProviderHealthSummary[] }> {
    if (
      useCache &&
      this.cachedSnapshot &&
      Date.now() - this.cachedSnapshot.updatedAt.getTime() <=
        DEFAULT_CACHE_TTL_MS
    ) {
      return this.cachedSnapshot;
    }

    const providers = await this.refreshRollingMetrics();

    return {
      updatedAt: this.cachedSnapshot?.updatedAt ?? new Date(),
      providers,
    };
  }

  public async refreshRollingMetrics(): Promise<ProviderHealthSummary[]> {
    const summaries = await this.providerHealthRepository.getProviderSummaries(
      new Date(),
    );

    const summariesByProvider = new Map(
      summaries.map((summary) => [summary.providerName, summary]),
    );

    const providers = this.registeredProviders.map((providerName) => {
      const summary = summariesByProvider.get(providerName);

      if (summary) {
        return summary;
      }

      return {
        providerName,
        status: 'UNKNOWN' as const,
        checks24h: 0,
        uptime24h: 0,
        errorRate1h: 0,
        avgLatencyMs: null,
        lastCheckedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
      };
    });

    this.cachedSnapshot = {
      updatedAt: new Date(),
      providers,
    };

    return providers;
  }

  public async cleanupStaleChecks(retentionDays = 14): Promise<number> {
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );
    return this.providerHealthRepository.deleteOlderThan(cutoffDate);
  }
}
