import { getHistory, latestSnapshot } from './history.js';

export function riskScore(snapshot = latestSnapshot()) {
  const xlm = snapshot.assets.find((asset) => asset.symbol === 'XLM')?.allocation ?? 0;
  const concentration = Math.max(...snapshot.assets.map((asset) => asset.allocation));
  const volatilityPenalty = xlm > 12 ? 8 : 3;
  const concentrationPenalty = concentration > 90 ? 12 : 4;
  return Math.max(1, Math.min(100, 100 - volatilityPenalty - concentrationPenalty));
}

export function intelligenceSummary() {
  const snapshot = latestSnapshot();
  const score = riskScore(snapshot);
  const trend = getHistory(7);
  return {
    asOf: snapshot.asOf,
    score,
    posture: score >= 85 ? 'resilient' : score >= 70 ? 'balanced' : 'watch',
    highlights: [
      'Treasury remains majority USDC with measured XLM exposure.',
      'Seven-day NAV trend is positive across the sample window.',
      'Yield opportunity remains above the monitoring threshold.'
    ],
    recommendations: [
      'Keep USDC operating reserves above 80% of treasury value.',
      'Review XLM exposure if allocation moves above 12%.',
      'Refresh live balances before executing rebalancing transactions.'
    ],
    trend
  };
}

export function signalSet() {
  const snapshot = latestSnapshot();
  return [
    { name: 'Reserve health', status: 'green', detail: `${snapshot.assets[0].allocation}% allocated to USDC reserves.` },
    { name: 'Yield monitor', status: 'green', detail: `${snapshot.yieldBps} bps estimated annualized yield.` },
    { name: 'Volatility watch', status: snapshot.assets[1].allocation > 12 ? 'amber' : 'green', detail: `${snapshot.assets[1].allocation}% allocated to XLM.` }
  ];
}
