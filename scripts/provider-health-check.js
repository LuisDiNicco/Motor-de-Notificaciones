/* eslint-disable no-console */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const MIN_UPTIME_24H = Number(process.env.PROVIDER_MIN_UPTIME_24H || 50);
const MAX_ERROR_RATE_1H = Number(process.env.PROVIDER_MAX_ERROR_RATE_1H || 80);
const PING_TIMEOUT_MS = Number(process.env.PROVIDER_PING_TIMEOUT_MS || 5000);

const PROVIDER_PING_TARGETS = {
  'dolarapi.com': process.env.PING_DOLARAPI_URL || 'https://dolarapi.com/v1/dolares',
  'bluelytics.com': process.env.PING_BLUELYTICS_URL || 'https://api.bluelytics.com.ar/v2/latest',
  'criptoya.com': process.env.PING_CRIPTOYA_URL || 'https://criptoya.com/api/dolar',
  'api.argentinadatos.com':
    process.env.PING_ARGENTINA_DATOS_URL ||
    'https://api.argentinadatos.com/v1/cotizaciones/dolares',
  'api.bcra.gob.ar':
    process.env.PING_BCRA_URL ||
    'https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias/10',
  'rava.com': process.env.PING_RAVA_URL || 'https://www.rava.com/robots.txt',
  'open.bymadata.com.ar':
    process.env.PING_BYMA_URL ||
    'https://open.bymadata.com.ar/',
  'data912.com': process.env.PING_DATA912_URL || 'https://data912.com/live/arg_stocks',
  'yahoo-finance': process.env.PING_YAHOO_URL || 'https://query1.finance.yahoo.com/v1/test/getcrumb',
  'alphavantage.co':
    process.env.PING_ALPHAVANTAGE_URL ||
    'https://www.alphavantage.co/query?function=OVERVIEW&symbol=IBM&apikey=demo',
};

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }

  return response.json();
}

async function pingUrl(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'NotiFinance-ProviderHealthCheck/1.0',
      },
    });

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: -1,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
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

    const pingTarget = PROVIDER_PING_TARGETS[provider.providerName];
    if (!pingTarget) {
      console.log(`PING ${provider.providerName}: skipped (no target configured)`);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const pingResult = await pingUrl(pingTarget, PING_TIMEOUT_MS);
    console.log(
      `PING ${provider.providerName}: url=${pingTarget} status=${pingResult.status} latencyMs=${pingResult.latencyMs}${pingResult.error ? ` error=${pingResult.error}` : ''}`,
    );

    if (!pingResult.ok) {
      failures.push(
        `${provider.providerName}: ping failed status=${pingResult.status}${pingResult.error ? ` error=${pingResult.error}` : ''}`,
      );
    }
  }

  console.log(`PROVIDER_HEALTH_BASE_URL=${BASE_URL}`);
  console.log(`PROVIDER_MIN_UPTIME_24H=${MIN_UPTIME_24H}`);
  console.log(`PROVIDER_MAX_ERROR_RATE_1H=${MAX_ERROR_RATE_1H}`);
  console.log(`PROVIDER_PING_TIMEOUT_MS=${PING_TIMEOUT_MS}`);

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
