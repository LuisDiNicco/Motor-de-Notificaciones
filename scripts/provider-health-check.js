/* eslint-disable no-console */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const MIN_UPTIME_24H = Number(process.env.PROVIDER_MIN_UPTIME_24H || 50);
const MAX_ERROR_RATE_1H = Number(process.env.PROVIDER_MAX_ERROR_RATE_1H || 80);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }

  return response.json();
}

async function main() {
  const payload = await fetchJson(`${BASE_URL}/api/v1/health/providers`);
  const providers = Array.isArray(payload?.providers) ? payload.providers : [];

  const failures = [];

  for (const provider of providers) {
    const status = String(provider.status || 'UNKNOWN');
    const uptime24h = Number(provider.uptime24h || 0);
    const errorRate1h = Number(provider.errorRate1h || 0);

    console.log(
      `CHECK ${provider.providerName}: status=${status} uptime24h=${uptime24h.toFixed(2)}% errorRate1h=${errorRate1h.toFixed(2)}% avgLatencyMs=${provider.avgLatencyMs ?? 'n/a'}`,
    );

    if (status === 'FAILURE') {
      failures.push(`${provider.providerName}: status FAILURE`);
    }

    if (uptime24h < MIN_UPTIME_24H) {
      failures.push(
        `${provider.providerName}: uptime24h ${uptime24h.toFixed(2)}% < ${MIN_UPTIME_24H}%`,
      );
    }

    if (errorRate1h > MAX_ERROR_RATE_1H) {
      failures.push(
        `${provider.providerName}: errorRate1h ${errorRate1h.toFixed(2)}% > ${MAX_ERROR_RATE_1H}%`,
      );
    }
  }

  console.log(`PROVIDER_HEALTH_BASE_URL=${BASE_URL}`);
  console.log(`PROVIDER_MIN_UPTIME_24H=${MIN_UPTIME_24H}`);
  console.log(`PROVIDER_MAX_ERROR_RATE_1H=${MAX_ERROR_RATE_1H}`);

  if (failures.length > 0) {
    console.log(`FAILURES=${failures.length}`);
    for (const failure of failures) {
      console.log(`FAIL ${failure}`);
    }
    process.exit(1);
  }

  console.log('PROVIDER_HEALTH_STATUS=OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
