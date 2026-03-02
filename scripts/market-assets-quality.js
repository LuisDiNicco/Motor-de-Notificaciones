/* eslint-disable no-console */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const PAGE_LIMIT = Number(process.env.ASSET_QUALITY_PAGE_LIMIT || 200);

const MERV_PANEL_TICKERS = [
  'GGAL',
  'YPF',
  'BMA',
  'SUPV',
  'PAMP',
  'TXAR',
  'ALUA',
  'TECO2',
  'MIRG',
  'CRES',
  'LOMA',
  'EDN',
  'TGSU2',
  'TRAN',
  'CEPU',
  'COME',
  'VALO',
  'BYMA',
  'BBAR',
  'IRSA',
];

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchAllAssets(type, includeInactive) {
  const all = [];
  let page = 1;

  while (true) {
    const payload = await fetchJson(
      `${BASE_URL}/api/v1/assets?type=${type}&includeInactive=${includeInactive ? 'true' : 'false'}&page=${page}&limit=${PAGE_LIMIT}`,
    );

    const data = Array.isArray(payload?.data) ? payload.data : [];
    const meta = payload?.meta ?? {};

    all.push(...data);

    const totalPages = Number(meta.totalPages || 1);
    if (page >= totalPages) {
      break;
    }

    page += 1;
  }

  return all;
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function isMatured(dateValue) {
  if (!dateValue) {
    return false;
  }

  const maturityDate = new Date(dateValue);
  if (Number.isNaN(maturityDate.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return maturityDate.getTime() < today.getTime();
}

async function main() {
  const failures = [];
  const checks = [];

  const stockAssets = await fetchAllAssets('STOCK', true);
  const bondAssets = await fetchAllAssets('BOND', true);
  const lecapAssets = await fetchAllAssets('LECAP', true);
  const boncapAssets = await fetchAllAssets('BONCAP', true);

  const assets = [...stockAssets, ...bondAssets, ...lecapAssets, ...boncapAssets];
  const activeMatured = assets.filter(
    (asset) => asset?.isActive === true && isMatured(asset?.maturityDate),
  );

  if (activeMatured.length > 0) {
    for (const asset of activeMatured) {
      failures.push(
        `Matured asset active: ${asset.ticker} maturityDate=${asset.maturityDate}`,
      );
    }
  }

  checks.push(
    `Matured active assets: ${activeMatured.length} (total checked=${assets.length})`,
  );

  const stockByTicker = new Map(
    stockAssets.map((asset) => [normalizeTicker(asset?.ticker), asset]),
  );

  const missingMerval = MERV_PANEL_TICKERS.filter(
    (ticker) => !stockByTicker.has(ticker),
  );

  if (missingMerval.length > 0) {
    failures.push(
      `Missing Merval tickers in catalog: ${missingMerval.join(', ')}`,
    );
  }

  const inactiveMerval = MERV_PANEL_TICKERS.filter((ticker) => {
    const asset = stockByTicker.get(ticker);
    return asset && asset.isActive === false;
  });

  if (inactiveMerval.length > 0) {
    failures.push(
      `Inactive Merval tickers detected: ${inactiveMerval.join(', ')}`,
    );
  }

  checks.push(
    `Merval coverage: present=${MERV_PANEL_TICKERS.length - missingMerval.length}/${MERV_PANEL_TICKERS.length}`,
  );

  console.log(`ASSET_QUALITY_BASE_URL=${BASE_URL}`);
  console.log(`ASSET_QUALITY_PAGE_LIMIT=${PAGE_LIMIT}`);
  for (const check of checks) {
    console.log(`CHECK ${check}`);
  }

  if (failures.length > 0) {
    console.log(`FAILURES=${failures.length}`);
    for (const failure of failures) {
      console.log(`FAIL ${failure}`);
    }
    process.exit(1);
  }

  console.log('ASSET_QUALITY_STATUS=OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
