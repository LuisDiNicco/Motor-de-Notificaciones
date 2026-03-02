import { Injectable } from '@nestjs/common';
import { ProviderHealthTracker } from './ProviderHealthTracker';
import { type ProviderHealthSummary } from '../domain/entities/ProviderHealth';

export type ProviderConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ProviderScore {
  providerName: string;
  score: number;
  confidence: ProviderConfidence;
}

@Injectable()
export class ProviderScorer {
  constructor(private readonly providerHealthTracker: ProviderHealthTracker) {}

  public async scoreProviders(): Promise<ProviderScore[]> {
    const snapshot = await this.providerHealthTracker.getProviderHealth(false);

    return snapshot.providers
      .map((provider) => this.toProviderScore(provider, snapshot.updatedAt))
      .sort((left, right) => right.score - left.score);
  }

  private toProviderScore(
    provider: ProviderHealthSummary,
    referenceDate: Date,
  ): ProviderScore {
    const uptimeScore = this.clamp(provider.uptime24h, 0, 100);
    const errorScore = this.clamp(100 - provider.errorRate1h, 0, 100);
    const latencyScore = this.toLatencyScore(provider.avgLatencyMs);
    const ageScore = this.toAgeScore(provider.lastCheckedAt, referenceDate);

    const score = Number(
      (
        uptimeScore * 0.4 +
        errorScore * 0.3 +
        latencyScore * 0.2 +
        ageScore * 0.1
      ).toFixed(2),
    );

    return {
      providerName: provider.providerName,
      score,
      confidence: this.toConfidence(score),
    };
  }

  private toLatencyScore(latencyMs: number | null): number {
    if (latencyMs == null || latencyMs <= 0) {
      return 50;
    }

    if (latencyMs <= 200) {
      return 100;
    }

    if (latencyMs >= 3000) {
      return 0;
    }

    const normalized = ((3000 - latencyMs) / (3000 - 200)) * 100;
    return this.clamp(normalized, 0, 100);
  }

  private toAgeScore(lastCheckedAt: Date | null, referenceDate: Date): number {
    if (!lastCheckedAt) {
      return 0;
    }

    const ageMinutes =
      (referenceDate.getTime() - lastCheckedAt.getTime()) / (60 * 1000);

    if (ageMinutes <= 5) {
      return 100;
    }

    if (ageMinutes >= 120) {
      return 0;
    }

    const normalized = ((120 - ageMinutes) / (120 - 5)) * 100;
    return this.clamp(normalized, 0, 100);
  }

  private toConfidence(score: number): ProviderConfidence {
    if (score >= 80) {
      return 'HIGH';
    }

    if (score >= 60) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
