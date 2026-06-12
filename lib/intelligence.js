const STABLE_CODES = new Set(['USDC', 'USDT', 'USD', 'EURC', 'EURT', 'DAI']);

function pct(part, whole) {
  if (!whole) return 0;
  return Number(((part / whole) * 100).toFixed(2));
}

function stableValue(aggregate) {
  return aggregate.assets
    .filter((asset) => STABLE_CODES.has(asset.code?.toUpperCase()) && Number.isFinite(asset.valueUsd))
    .reduce((sum, asset) => sum + asset.valueUsd, 0);
}

function xlmValue(aggregate) {
  return aggregate.totals?.xlmValueUsd ?? 0;
}

export function treasuryHealthScore(aggregate) {
  const nav = aggregate.totals.valueUsd;
  const stablePct = pct(stableValue(aggregate), nav);
  const xlmPct = pct(xlmValue(aggregate), nav);
  const unpricedPenalty = (aggregate.totals.unpricedAssets ?? 0) * 8;
  const walletPenalty = aggregate.errors.length * 12;
  const concentration = Math.max(0, ...aggregate.assets.map((asset) => pct(asset.valueUsd ?? 0, nav)));

  let score = 50;
  score += Math.min(stablePct, 80) * 0.35;
  score += aggregate.successfulWalletCount > 1 ? 8 : 2;
  score -= xlmPct > 20 ? (xlmPct - 20) * 0.8 : 0;
  score -= concentration > 85 ? (concentration - 85) * 0.6 : 0;
  score -= unpricedPenalty + walletPenalty;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    stableAllocationPct: stablePct,
    xlmAllocationPct: xlmPct,
    concentrationPct: Number(concentration.toFixed(2)),
    status: score >= 80 ? 'strong' : score >= 60 ? 'balanced' : 'watch'
  };
}

export function idleCapitalDetection(aggregate) {
  const idleXlm = aggregate.accounts.reduce((sum, account) => sum + account.spendableXlm, 0);
  const xlmPrice = aggregate.priceBook?.XLM;
  return {
    spendableXlm: Number(idleXlm.toFixed(7)),
    estimatedUsd: Number.isFinite(xlmPrice) ? Number((idleXlm * xlmPrice).toFixed(2)) : null,
    message: idleXlm > 100 ? 'Spendable XLM is available above account reserves.' : 'No material idle XLM detected above account reserves.'
  };
}

export function treasuryAlerts(aggregate, health) {
  const alerts = [];
  for (const error of aggregate.errors) alerts.push({ level: 'critical', title: 'Wallet query failed', detail: `${error.wallet}: ${error.message}` });
  if (aggregate.totals.unpricedAssets > 0) alerts.push({ level: 'warning', title: 'Unpriced assets', detail: `${aggregate.totals.unpricedAssets} asset(s) do not have USD pricing and are excluded from NAV.` });
  if (health.xlmAllocationPct > 20) alerts.push({ level: 'warning', title: 'XLM exposure above benchmark', detail: `XLM is ${health.xlmAllocationPct}% of priced treasury value.` });
  if (health.stableAllocationPct < 50 && aggregate.totals.valueUsd > 0) alerts.push({ level: 'warning', title: 'Low stable reserve allocation', detail: `Stable assets are ${health.stableAllocationPct}% of priced treasury value.` });
  if (!alerts.length) alerts.push({ level: 'info', title: 'No critical treasury alerts', detail: 'Live wallet aggregation did not trigger the configured rule thresholds.' });
  return alerts;
}

export function ruleBasedBenchmarking(aggregate, health) {
  return [
    { rule: 'Stable reserves ≥ 50%', value: `${health.stableAllocationPct}%`, passed: health.stableAllocationPct >= 50 || aggregate.totals.valueUsd === 0 },
    { rule: 'XLM exposure ≤ 20%', value: `${health.xlmAllocationPct}%`, passed: health.xlmAllocationPct <= 20 },
    { rule: 'All assets priced', value: `${aggregate.totals.unpricedAssets} unpriced`, passed: aggregate.totals.unpricedAssets === 0 },
    { rule: 'All wallets queried', value: `${aggregate.successfulWalletCount}/${aggregate.walletCount}`, passed: aggregate.errors.length === 0 }
  ];
}

export function snapshotChangeDetection(aggregate, previousSnapshot) {
  const current = aggregate.totals.valueUsd;
  const previous = Number(previousSnapshot?.totals?.valueUsd ?? previousSnapshot?.valueUsd);
  if (!Number.isFinite(previous) || previous <= 0) {
    return { available: false, message: 'No previous snapshot supplied. Save or share a snapshot to compare future changes.' };
  }
  const change = current - previous;
  return {
    available: true,
    previousValueUsd: previous,
    currentValueUsd: current,
    changeUsd: Number(change.toFixed(2)),
    changePct: Number(((change / previous) * 100).toFixed(2))
  };
}

export function treasurySimulation(aggregate) {
  const nav = aggregate.totals.valueUsd;
  const xlmPrice = aggregate.priceBook?.XLM;
  const xlmBalance = aggregate.totals.xlmBalance ?? 0;
  return {
    xlmDown10Usd: Number.isFinite(xlmPrice) ? Number((nav - (xlmBalance * xlmPrice * 0.1)).toFixed(2)) : null,
    xlmUp10Usd: Number.isFinite(xlmPrice) ? Number((nav + (xlmBalance * xlmPrice * 0.1)).toFixed(2)) : null,
    stableReserveTargetUsd: Number((nav * 0.5).toFixed(2)),
    note: 'Scenario uses the live aggregate balances and current XLM price from the pricing provider.'
  };
}

export function executiveTreasuryBrief(aggregate, health, alerts) {
  const nav = aggregate.totals.valueUsd;
  const alertText = alerts.filter((alert) => alert.level !== 'info').length ? `${alerts.filter((alert) => alert.level !== 'info').length} alert(s) need review` : 'no critical alerts';
  return `Priced treasury value is ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(nav)} across ${aggregate.successfulWalletCount} live wallet(s). Health is ${health.status} at ${health.score}/100 with ${alertText}.`;
}

export function intelligenceSummary(aggregate, { previousSnapshot = null } = {}) {
  const health = treasuryHealthScore(aggregate);
  const alerts = treasuryAlerts(aggregate, health);
  return {
    asOf: aggregate.asOf,
    health,
    idleCapital: idleCapitalDetection(aggregate),
    alerts,
    benchmarks: ruleBasedBenchmarking(aggregate, health),
    snapshotChange: snapshotChangeDetection(aggregate, previousSnapshot),
    simulation: treasurySimulation(aggregate),
    executiveBrief: executiveTreasuryBrief(aggregate, health, alerts)
  };
}

export function signalSet(aggregate) {
  const health = treasuryHealthScore(aggregate);
  return [
    { name: 'Treasury health', status: health.score >= 80 ? 'green' : health.score >= 60 ? 'amber' : 'red', detail: `Health score ${health.score}/100 from live aggregate balances.` },
    { name: 'Stable reserve', status: health.stableAllocationPct >= 50 ? 'green' : 'amber', detail: `${health.stableAllocationPct}% of priced value is in stable assets.` },
    { name: 'XLM exposure', status: health.xlmAllocationPct <= 20 ? 'green' : 'amber', detail: `${health.xlmAllocationPct}% of priced value is in XLM.` }
  ];
}
