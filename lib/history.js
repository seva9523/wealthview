export const history = [
  { date: '2026-06-06', nav: 1242500, xlm: 121000, usdc: 1121500, yieldBps: 430 },
  { date: '2026-06-07', nav: 1249100, xlm: 121800, usdc: 1127300, yieldBps: 432 },
  { date: '2026-06-08', nav: 1255300, xlm: 122300, usdc: 1133000, yieldBps: 438 },
  { date: '2026-06-09', nav: 1261800, xlm: 123100, usdc: 1138700, yieldBps: 441 },
  { date: '2026-06-10', nav: 1269400, xlm: 124700, usdc: 1144700, yieldBps: 447 },
  { date: '2026-06-11', nav: 1274200, xlm: 125500, usdc: 1148700, yieldBps: 450 },
  { date: '2026-06-12', nav: 1280600, xlm: 126400, usdc: 1154200, yieldBps: 452 }
];

export function getHistory(limit = history.length) {
  const count = Number.isFinite(Number(limit)) ? Number(limit) : history.length;
  return history.slice(Math.max(history.length - count, 0));
}

export function latestSnapshot() {
  const latest = history.at(-1);
  const previous = history.at(-2) ?? latest;
  return {
    asOf: `${latest.date}T00:00:00.000Z`,
    netAssetValue: latest.nav,
    dailyChange: latest.nav - previous.nav,
    dailyChangePct: Number((((latest.nav - previous.nav) / previous.nav) * 100).toFixed(2)),
    assets: [
      { symbol: 'USDC', network: 'Stellar', value: latest.usdc, allocation: Number(((latest.usdc / latest.nav) * 100).toFixed(2)) },
      { symbol: 'XLM', network: 'Stellar', value: latest.xlm, allocation: Number(((latest.xlm / latest.nav) * 100).toFixed(2)) }
    ],
    yieldBps: latest.yieldBps
  };
}
