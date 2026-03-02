/* eslint-disable no-console */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

const publicEndpoints = [
  ['GET', '/api/v1/health'],
  ['GET', '/api/v1/assets?type=STOCK&page=1&limit=5'],
  ['GET', '/api/v1/assets/top/gainers?type=STOCK&limit=5'],
  ['GET', '/api/v1/assets/top/losers?type=STOCK&limit=5'],
  ['GET', '/api/v1/assets/GGAL'],
  ['GET', '/api/v1/assets/GGAL/quotes?days=30'],
  ['GET', '/api/v1/assets/GGAL/stats?days=30'],
  ['GET', '/api/v1/assets/GGAL/related?limit=5'],
  ['GET', '/api/v1/search?q=gal&limit=5'],
  ['GET', '/api/v1/market/dollar'],
  ['GET', '/api/v1/market/dollar/blue'],
  ['GET', '/api/v1/market/dollar/history/BLUE?days=30'],
  ['GET', '/api/v1/market/dollar/history?type=BLUE&days=30'],
  ['GET', '/api/v1/market/risk'],
  ['GET', '/api/v1/market/risk/history?days=30'],
  ['GET', '/api/v1/market/summary'],
  ['GET', '/api/v1/market/status'],
  ['GET', '/api/v1/market/top-movers?type=STOCK&limit=5'],
  ['GET', '/api/v1/templates'],
];

const unauthProtectedEndpoints = [
  ['GET', '/api/v1/watchlist'],
  ['GET', '/api/v1/alerts'],
  ['GET', '/api/v1/notifications'],
  ['GET', '/api/v1/preferences'],
  ['GET', '/api/v1/portfolios'],
];

const authProtectedEndpoints = [
  ['GET', '/api/v1/watchlist'],
  ['GET', '/api/v1/alerts'],
  ['GET', '/api/v1/notifications'],
  ['GET', '/api/v1/preferences'],
  ['GET', '/api/v1/portfolios'],
];

async function callEndpoint(method, path, options = {}) {
  const { token, body } = options;
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body != null) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();

    return {
      method,
      path,
      status: response.status,
      body: text,
    };
  } catch (error) {
    return {
      method,
      path,
      status: -1,
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getDemoToken() {
  const response = await callEndpoint('POST', '/api/v1/auth/demo', { body: {} });

  if (response.status < 200 || response.status >= 300) {
    return null;
  }

  try {
    const payload = JSON.parse(response.body);
    return typeof payload.accessToken === 'string' ? payload.accessToken : null;
  } catch {
    return null;
  }
}

async function main() {
  const results = [];

  for (const [method, path] of publicEndpoints) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await callEndpoint(method, path));
  }

  for (const [method, path] of unauthProtectedEndpoints) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await callEndpoint(method, path));
  }

  const demoToken = await getDemoToken();

  if (demoToken) {
    for (const [method, path] of authProtectedEndpoints) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await callEndpoint(method, path, { token: demoToken }));
    }
  }

  const failures = [];

  for (const result of results) {
    const key = `${result.method} ${result.path}`;
    if (result.status === -1) {
      failures.push(`${key} -> transport error: ${result.body}`);
      continue;
    }

    const isPublicEndpoint = publicEndpoints.some(
      ([method, path]) => method === result.method && path === result.path,
    );
    const isUnauthProtected = unauthProtectedEndpoints.some(
      ([method, path]) => method === result.method && path === result.path,
    );
    const isAuthProtected = authProtectedEndpoints.some(
      ([method, path]) => method === result.method && path === result.path,
    );

    if (isPublicEndpoint && (result.status < 200 || result.status >= 300)) {
      failures.push(`${key} -> expected 2xx, got ${result.status}`);
      continue;
    }

    if (isUnauthProtected && ![401, 403].includes(result.status)) {
      failures.push(`${key} -> expected 401/403 without token, got ${result.status}`);
      continue;
    }

    if (isAuthProtected && demoToken && (result.status < 200 || result.status >= 300)) {
      failures.push(`${key} -> expected 2xx with demo token, got ${result.status}`);
      continue;
    }

    if (result.status >= 500) {
      failures.push(`${key} -> server error ${result.status}: ${result.body}`);
    }
  }

  console.log(`SMOKE_BASE_URL=${BASE_URL}`);
  console.log(`TOTAL=${results.length}`);
  console.log(`FAILURES=${failures.length}`);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`FAIL ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
