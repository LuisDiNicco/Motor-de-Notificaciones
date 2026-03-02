import {
  ProviderHealth,
  ProviderHealthSummary,
} from '../domain/entities/ProviderHealth';

export const PROVIDER_HEALTH_REPOSITORY = 'IProviderHealthRepository';

export interface IProviderHealthRepository {
  saveCheck(record: ProviderHealth): Promise<void>;
  getProviderSummaries(referenceDate: Date): Promise<ProviderHealthSummary[]>;
  deleteOlderThan(cutoffDate: Date): Promise<number>;
}
