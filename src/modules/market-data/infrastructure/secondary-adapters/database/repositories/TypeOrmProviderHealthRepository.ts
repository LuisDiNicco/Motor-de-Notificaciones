import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IProviderHealthRepository } from '../../../../application/IProviderHealthRepository';
import {
  ProviderCheckStatus,
  ProviderHealth,
  ProviderHealthSummary,
} from '../../../../domain/entities/ProviderHealth';
import { ProviderHealthEntity } from '../entities/ProviderHealthEntity';

interface RawProviderHealthSummaryRow {
  providerName: string;
  checks24h: string;
  successCount24h: string;
  checks1h: string;
  failureCount1h: string;
  avgLatencyMs: string | null;
  lastStatus: ProviderCheckStatus;
  lastCheckedAt: Date | string | null;
  lastSuccessAt: Date | string | null;
  lastFailureAt: Date | string | null;
}

@Injectable()
export class TypeOrmProviderHealthRepository implements IProviderHealthRepository {
  constructor(
    @InjectRepository(ProviderHealthEntity)
    private readonly repository: Repository<ProviderHealthEntity>,
  ) {}

  public async saveCheck(record: ProviderHealth): Promise<void> {
    const entity = this.repository.create({
      providerName: record.providerName,
      status: record.status,
      latencyMs: record.latencyMs,
      checkedAt: record.checkedAt,
      endpoint: record.endpoint,
      errorMessage: record.errorMessage,
    });

    await this.repository.save(entity);
  }

  public async getProviderSummaries(
    referenceDate: Date,
  ): Promise<ProviderHealthSummary[]> {
    const start24h = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
    const start1h = new Date(referenceDate.getTime() - 60 * 60 * 1000);

    const rawRows: unknown = await this.repository.query(
      `
        WITH window_24h AS (
          SELECT
            ph."providerName" AS "providerName",
            COUNT(*)::int AS "checks24h",
            SUM(CASE WHEN ph."status" = 'SUCCESS' THEN 1 ELSE 0 END)::int AS "successCount24h",
            AVG(ph."latencyMs")::float AS "avgLatencyMs"
          FROM "provider_health" ph
          WHERE ph."checkedAt" >= $1
          GROUP BY ph."providerName"
        ),
        window_1h AS (
          SELECT
            ph."providerName" AS "providerName",
            COUNT(*)::int AS "checks1h",
            SUM(CASE WHEN ph."status" = 'FAILURE' THEN 1 ELSE 0 END)::int AS "failureCount1h"
          FROM "provider_health" ph
          WHERE ph."checkedAt" >= $2
          GROUP BY ph."providerName"
        ),
        last_event AS (
          SELECT DISTINCT ON (ph."providerName")
            ph."providerName" AS "providerName",
            ph."status" AS "lastStatus",
            ph."checkedAt" AS "lastCheckedAt"
          FROM "provider_health" ph
          WHERE ph."checkedAt" >= $1
          ORDER BY ph."providerName", ph."checkedAt" DESC
        ),
        last_success AS (
          SELECT
            ph."providerName" AS "providerName",
            MAX(ph."checkedAt") AS "lastSuccessAt"
          FROM "provider_health" ph
          WHERE ph."checkedAt" >= $1 AND ph."status" = 'SUCCESS'
          GROUP BY ph."providerName"
        ),
        last_failure AS (
          SELECT
            ph."providerName" AS "providerName",
            MAX(ph."checkedAt") AS "lastFailureAt"
          FROM "provider_health" ph
          WHERE ph."checkedAt" >= $1 AND ph."status" = 'FAILURE'
          GROUP BY ph."providerName"
        )
        SELECT
          w24."providerName",
          w24."checks24h",
          w24."successCount24h",
          COALESCE(w1."checks1h", 0)::int AS "checks1h",
          COALESCE(w1."failureCount1h", 0)::int AS "failureCount1h",
          w24."avgLatencyMs",
          le."lastStatus",
          le."lastCheckedAt",
          ls."lastSuccessAt",
          lf."lastFailureAt"
        FROM window_24h w24
        LEFT JOIN window_1h w1 ON w1."providerName" = w24."providerName"
        LEFT JOIN last_event le ON le."providerName" = w24."providerName"
        LEFT JOIN last_success ls ON ls."providerName" = w24."providerName"
        LEFT JOIN last_failure lf ON lf."providerName" = w24."providerName"
      `,
      [start24h, start1h],
    );

    if (!Array.isArray(rawRows)) {
      return [];
    }

    const rows = rawRows.filter((row): row is RawProviderHealthSummaryRow =>
      this.isRawSummaryRow(row),
    );

    return rows.map((row) => {
      const checks24h = Number(row.checks24h);
      const successCount24h = Number(row.successCount24h);
      const checks1h = Number(row.checks1h);
      const failureCount1h = Number(row.failureCount1h);

      return {
        providerName: row.providerName,
        status: row.lastStatus,
        checks24h,
        uptime24h:
          checks24h > 0
            ? Number(((successCount24h / checks24h) * 100).toFixed(2))
            : 0,
        errorRate1h:
          checks1h > 0
            ? Number(((failureCount1h / checks1h) * 100).toFixed(2))
            : 0,
        avgLatencyMs:
          row.avgLatencyMs == null
            ? null
            : Number(Number(row.avgLatencyMs).toFixed(2)),
        lastCheckedAt: this.toDate(row.lastCheckedAt),
        lastSuccessAt: this.toDate(row.lastSuccessAt),
        lastFailureAt: this.toDate(row.lastFailureAt),
      } satisfies ProviderHealthSummary;
    });
  }

  public async deleteOlderThan(cutoffDate: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(ProviderHealthEntity)
      .where('"checkedAt" < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected ?? 0;
  }

  private toDate(value: Date | string | null): Date | null {
    if (value == null) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private isRawSummaryRow(
    value: unknown,
  ): value is RawProviderHealthSummaryRow {
    if (typeof value !== 'object' || value == null) {
      return false;
    }

    const row = value as Record<string, unknown>;
    return (
      typeof row['providerName'] === 'string' &&
      typeof row['checks24h'] === 'string' &&
      typeof row['successCount24h'] === 'string' &&
      typeof row['checks1h'] === 'string' &&
      typeof row['failureCount1h'] === 'string' &&
      (typeof row['avgLatencyMs'] === 'string' ||
        row['avgLatencyMs'] == null) &&
      typeof row['lastStatus'] === 'string'
    );
  }
}
