import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProviderHealthTracker } from '../../../../application/ProviderHealthTracker';

@ApiTags('Health')
@Controller('health/providers')
export class ProviderHealthController {
  constructor(private readonly providerHealthTracker: ProviderHealthTracker) {}

  @Get()
  @ApiOperation({ summary: 'Get provider health metrics and rolling status' })
  @ApiResponse({ status: 200 })
  public async getProviderHealth(): Promise<{
    updatedAt: string;
    providers: Array<{
      providerName: string;
      status: 'SUCCESS' | 'FAILURE' | 'UNKNOWN';
      checks24h: number;
      uptime24h: number;
      errorRate1h: number;
      avgLatencyMs: number | null;
      lastCheckedAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
    }>;
  }> {
    const snapshot = await this.providerHealthTracker.getProviderHealth();

    return {
      updatedAt: snapshot.updatedAt.toISOString(),
      providers: snapshot.providers.map((provider) => ({
        providerName: provider.providerName,
        status: provider.status,
        checks24h: provider.checks24h,
        uptime24h: provider.uptime24h,
        errorRate1h: provider.errorRate1h,
        avgLatencyMs: provider.avgLatencyMs,
        lastCheckedAt: provider.lastCheckedAt?.toISOString() ?? null,
        lastSuccessAt: provider.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: provider.lastFailureAt?.toISOString() ?? null,
      })),
    };
  }
}
