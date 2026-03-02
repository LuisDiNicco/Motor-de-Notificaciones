/* eslint-disable no-console */

const cheerio = require('cheerio');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const RAVA_QUOTES_URL =
  process.env.RAVA_QUOTES_URL || 'https://www.rava.com/empresas/cotizaciones';
const MAX_DEVIATION_PCT = Number(
  process.env.MARKET_QUALITY_MAX_DEVIATION_PCT || 3,
);
const DATA_STALE_THRESHOLD_MINUTES = Number(
  process.env.DATA_STALE_THRESHOLD_MINUTES || 30,
);

const MERV_TICKERS = [
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

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }

  return response.json();
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/\s/g, '');
    if (!cleaned) {
      return 0;
    }

    let normalized = cleaned;
    if (cleaned.includes(',') && cleaned.includes('.')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
      normalized = cleaned.replace(',', '.');
    } else if (cleaned.split('.').length > 2) {
      normalized = cleaned.replace(/\./g, '');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeTicker(value) {
  return String(value || '')
    .replace('.BA', '')
    .trim()
    .toUpperCase();
}

function parseRavaSnapshot(html) {
  const $ = cheerio.load(html);
  const referenceByTicker = new Map();

  $('table tbody tr').each((_index, row) => {
    const cells = $(row).find('td');
    const ticker = normalizeTicker($(cells[0]).text());
    if (!ticker) {
      return;
    }

    const closePrice = toNumber($(cells[1]).text());
    if (closePrice <= 0) {
      return;
    }

    referenceByTicker.set(ticker, closePrice);
  });

  return referenceByTicker;
}

function pickLatestQuote(quotes) {
  const list = Array.isArray(quotes) ? quotes : [];
  if (list.length === 0) {
    return null;
  }

  return [...list].sort((left, right) => {
    const leftDate = new Date(left.sourceTimestamp || left.date || 0).getTime();
    const rightDate = new Date(right.sourceTimestamp || right.date || 0).getTime();
    return rightDate - leftDate;
  })[0];
}

function resolveLatestPrice(quote) {
  if (!quote) {
    return 0;
  }

  return toNumber(quote.closePrice || quote.priceArs || quote.priceUsd);
}

function resolveAgeMinutes(quote) {
  if (!quote) {
    return null;
  }

  const timestamp = quote.sourceTimestamp || quote.date;
  if (!timestamp) {
    return null;
  }

  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs)) {
    return null;
  }

  return Math.max(0, Math.floor(ageMs / 60000));
}

async function main() {
  const failures = [];
  const warnings = [];
  const checks = [];

  const ravaHtml = await fetchText(RAVA_QUOTES_URL);
  const ravaReference = parseRavaSnapshot(ravaHtml);

  for (const ticker of MERV_TICKERS) {
    const quotes = await fetchJson(
      `${BASE_URL}/api/v1/assets/${encodeURIComponent(ticker)}/quotes?days=5`,
    );

    const latest = pickLatestQuote(quotes);
    const backendPrice = resolveLatestPrice(latest);
    const priceAgeMinutes = resolveAgeMinutes(latest);

    if (backendPrice <= 0) {
      failures.push(`${ticker}: backend has no valid latest price`);
      continue;
    }

    if (
      priceAgeMinutes == null ||
      priceAgeMinutes > DATA_STALE_THRESHOLD_MINUTES
    ) {
      failures.push(
        `${ticker}: stale price age=${priceAgeMinutes ?? 'null'}m (limit=${DATA_STALE_THRESHOLD_MINUTES}m)`,
      );
    }

    const referencePrice = ravaReference.get(ticker);
    if (!referencePrice || referencePrice <= 0) {
      warnings.push(`${ticker}: missing Rava reference`);
      checks.push(
        `${ticker}: backend=${backendPrice.toFixed(2)} age=${priceAgeMinutes ?? 'null'}m ref=n/a`,
      );
      continue;
    }

    const deviationPct =
      (Math.abs(backendPrice - referencePrice) / referencePrice) * 100;

    checks.push(
      `${ticker}: backend=${backendPrice.toFixed(2)} ref=${referencePrice.toFixed(2)} age=${priceAgeMinutes ?? 'null'}m dev=${deviationPct.toFixed(2)}%`,
    );

    if (deviationPct > MAX_DEVIATION_PCT) {
      failures.push(
        `${ticker}: deviation ${deviationPct.toFixed(2)}% > ${MAX_DEVIATION_PCT}%`,
      );
    }
  }

  console.log(`QUALITY_BASE_URL=${BASE_URL}`);
  console.log(`RAVA_QUOTES_URL=${RAVA_QUOTES_URL}`);
  console.log(`MARKET_QUALITY_MAX_DEVIATION_PCT=${MAX_DEVIATION_PCT}`);
  console.log(`DATA_STALE_THRESHOLD_MINUTES=${DATA_STALE_THRESHOLD_MINUTES}`);

  for (const check of checks) {
    console.log(`CHECK ${check}`);
  }

  if (warnings.length > 0) {
    console.log(`WARNINGS=${warnings.length}`);
    for (const warning of warnings) {
      console.log(`WARN ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.log(`FAILURES=${failures.length}`);
    for (const failure of failures) {
      console.log(`FAIL ${failure}`);
    }
    process.exit(1);
  }

  console.log('QUALITY_STATUS=OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
