const STABLE_CODES = new Set(['USDC', 'USDZ', 'EURC', 'EURX', 'GBPX']);
const VOLATILE_CODES = new Set(['XLM', 'AQUA']);

const usd = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0));
const pct = (part, whole) => (whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : 0);
const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
const pricedValue = (asset) => Number.isFinite(asset?.usdValue) ? asset.usdValue : Number.isFinite(asset?.valueUsd) ? asset.valueUsd : 0;
const assetAmount = (asset) => Number(asset?.amount ?? asset?.balance ?? 0);
const allocation = (asset) => Number(asset?.allocationPercent ?? asset?.allocationPct ?? 0);
const stableValue = (aggregate) => (aggregate.assets || []).filter((asset) => STABLE_CODES.has(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + pricedValue(asset), 0);
const volatileValue = (aggregate) => (aggregate.assets || []).filter((asset) => VOLATILE_CODES.has(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + pricedValue(asset), 0);
const topPricedAsset = (aggregate) => (aggregate.assets || []).filter((asset) => Number.isFinite(asset.usdValue ?? asset.valueUsd)).sort((a, b) => pricedValue(b) - pricedValue(a))[0] || null;

export function detectSnapshotChanges(aggregate, previousSnapshot = null) {
  const previousAggregate = previousSnapshot?.aggregate || previousSnapshot?.data?.aggregate || previousSnapshot;
  if (!previousAggregate || !Array.isArray(previousAggregate.assets)) {
    return { available: false, message: 'Upload a previous snapshot to detect treasury changes.' };
  }

  const previousUSD = Number(previousAggregate.totalUSD ?? previousAggregate.totals?.valueUsd ?? 0);
  const previousXLM = Number(previousAggregate.totalXLM ?? previousAggregate.totals?.xlmBalance ?? 0);
  const currentUSD = Number(aggregate.totalUSD || 0);
  const currentXLM = Number(aggregate.totalXLM || 0);
  const previousAssets = new Map(previousAggregate.assets.map((asset) => [asset.key || `${asset.type}:${asset.code}:${asset.issuer || asset.contractId || ''}`, asset]));
  const currentAssets = new Map((aggregate.assets || []).map((asset) => [asset.key || `${asset.type}:${asset.code}:${asset.issuer || asset.contractId || ''}`, asset]));
  const newAssets = [...currentAssets.entries()].filter(([key]) => !previousAssets.has(key)).map(([, asset]) => asset.code);
  const removedAssets = [...previousAssets.entries()].filter(([key]) => !currentAssets.has(key)).map(([, asset]) => asset.code);
  const previousTop = [...previousAssets.values()].filter((asset) => Number.isFinite(asset.usdValue ?? asset.valueUsd)).sort((a, b) => pricedValue(b) - pricedValue(a))[0];
  const currentTop = topPricedAsset(aggregate);

  return {
    available: true,
    message: 'Changes Since Previous Snapshot',
    totalUSDChange: Number((currentUSD - previousUSD).toFixed(2)),
    totalUSDChangePct: pct(currentUSD - previousUSD, previousUSD),
    totalXLMChange: Number((currentXLM - previousXLM).toFixed(7)),
    walletCountChange: (aggregate.wallets?.length || 0) - Number(previousAggregate.successfulWalletCount || previousAggregate.wallets?.length || 0),
    pricingCoverageChange: Number(((aggregate.pricingCoveragePct || 0) - Number(previousAggregate.pricingCoveragePct || 0)).toFixed(2)),
    concentrationChangePct: Number((allocation(currentTop) - allocation(previousTop)).toFixed(2)),
    newAssets,
    removedAssets
  };
}

export function detectIdleCapital(aggregate) {
  const treasuryValue = aggregate.totalUSD || 0;
  const stable = stableValue(aggregate);
  const xlm = (aggregate.assets || []).find((asset) => asset.type === 'native' && asset.code === 'XLM');
  const xlmValue = pricedValue(xlm || {});
  const contributingAssets = [];

  if (treasuryValue > 0 && pct(stable, treasuryValue) >= 35) {
    contributingAssets.push({ code: 'Supported stablecoins', valueUsd: Number(stable.toFixed(2)), reason: 'Meaningful supported stablecoin allocation may warrant a treasury policy review.' });
  }
  if (treasuryValue > 0 && pct(xlmValue, treasuryValue) >= 45) {
    contributingAssets.push({ code: 'XLM', valueUsd: Number(xlmValue.toFixed(2)), reason: 'High XLM concentration can represent overexposed network liquidity.' });
  }

  const idleCapitalUSD = Number(contributingAssets.reduce((sum, item) => sum + item.valueUsd, 0).toFixed(2));
  return {
    idleCapitalUSD,
    idleCapitalPercent: pct(idleCapitalUSD, treasuryValue),
    contributingAssets,
    explanation: contributingAssets.length
      ? 'WealthView flags visible priced assets that may merit conservative treasury review. Unpriced assets are excluded from opportunity calculations.'
      : 'No material potentially idle priced capital was detected under the current conservative rules.',
    suggestedReviewAction: contributingAssets.length
      ? 'Review treasury policy, liquidity runway, risk limits, and whether any reserves should remain immediately liquid.'
      : 'Keep a periodic snapshot cadence and review again after balances or prices change.'
  };
}

export function createAlerts(aggregate, changes = null, idleCapital = null) {
  const treasuryValue = aggregate.totalUSD || 0;
  const stablePct = pct(stableValue(aggregate), treasuryValue);
  const volatilePct = pct(volatileValue(aggregate), treasuryValue);
  const top = topPricedAsset(aggregate);
  const alerts = [];

  if (top && allocation(top) >= 60) alerts.push({ severity: 'risk', type: 'concentration', title: 'High asset concentration', explanation: `${top.code} represents ${allocation(top)}% of priced treasury value.`, suggestedAction: 'Set concentration limits and review whether diversification is appropriate.' });
  else if (top) alerts.push({ severity: 'good', type: 'concentration', title: 'No dominant priced asset above threshold', explanation: `Largest priced asset is ${top.code} at ${allocation(top)}%.`, suggestedAction: 'Continue monitoring concentration with snapshots.' });

  if (stablePct < 20 && treasuryValue > 0) alerts.push({ severity: 'watch', type: 'stablecoin exposure', title: 'Low supported stablecoin reserve exposure', explanation: `Supported stablecoins represent ${stablePct}% of priced value.`, suggestedAction: 'Review operating runway and liquidity policy.' });
  if (volatilePct > 50) alerts.push({ severity: 'watch', type: 'volatile exposure', title: 'Volatile exposure above readiness rule', explanation: `XLM/AQUA represent ${volatilePct}% of priced value.`, suggestedAction: 'Review volatility tolerance and treasury runway.' });
  if ((aggregate.pricingCoveragePct || 0) < 80 && (aggregate.assets || []).length) alerts.push({ severity: 'risk', type: 'pricing coverage', title: 'Pricing coverage is low', explanation: `${aggregate.pricingCoveragePct || 0}% of asset types have USD pricing. Unknown assets are excluded from USD totals.`, suggestedAction: 'Add pricing metadata or review unpriced balances manually.' });
  if (aggregate.unpricedAssets?.length) alerts.push({ severity: 'info', type: 'unpriced assets', title: 'Unpriced Stellar assets detected', explanation: `${aggregate.unpricedAssets.length} asset(s) are visible but excluded from USD value.`, suggestedAction: 'Review issuers and pricing sources before making treasury decisions.' });
  if ((aggregate.successfulWalletCount || 0) > 1) alerts.push({ severity: 'good', type: 'multi-wallet aggregation', title: 'Multiple wallets aggregated', explanation: `${aggregate.successfulWalletCount} wallets were combined read-only.`, suggestedAction: 'Use snapshots to track consolidated treasury changes.' });
  if (idleCapital?.idleCapitalUSD > 0) alerts.push({ severity: 'watch', type: 'idle capital', title: 'Potentially idle capital detected', explanation: `${usd(idleCapital.idleCapitalUSD)} was flagged for conservative review.`, suggestedAction: idleCapital.suggestedReviewAction });
  for (const warning of aggregate.warnings || []) alerts.push({ severity: warning.type === 'soroban' ? 'info' : 'watch', type: warning.type || 'warning', title: 'Non-fatal data warning', explanation: warning.message, suggestedAction: 'Review source availability; WealthView did not infer missing balances.' });
  for (const error of aggregate.errors || []) alerts.push({ severity: 'watch', type: 'wallet error', title: 'Wallet query issue', explanation: `${error.wallet || 'Input'}: ${error.message}`, suggestedAction: 'Correct invalid inputs or retry Horizon-backed aggregation.' });

  if (changes?.available) {
    if (Math.abs(changes.totalUSDChangePct) >= 15) alerts.push({ severity: 'watch', type: 'large treasury value movement', title: 'Large treasury value movement', explanation: `Priced value changed by ${changes.totalUSDChangePct}% since the uploaded snapshot.`, suggestedAction: 'Review transactions, pricing changes, and allocation drift.' });
    if (changes.newAssets?.length) alerts.push({ severity: 'info', type: 'new asset detected', title: 'New asset detected', explanation: `${changes.newAssets.join(', ')} appeared since the previous snapshot.`, suggestedAction: 'Review issuer, purpose, and pricing status.' });
  }

  if (!alerts.length) alerts.push({ severity: 'good', type: 'readiness', title: 'No major treasury issues detected', explanation: 'Current live aggregate balances passed WealthView treasury-readiness rules.', suggestedAction: 'Export a snapshot and continue periodic reviews.' });
  return alerts;
}

export function treasuryHealthScore(aggregate, alerts = []) {
  const treasuryValue = aggregate.totalUSD || 0;
  const stablePct = pct(stableValue(aggregate), treasuryValue);
  const volatilePct = pct(volatileValue(aggregate), treasuryValue);
  const top = topPricedAsset(aggregate);
  const concentrationPct = allocation(top);
  const pricedCoverage = aggregate.pricingCoveragePct || 0;
  const riskAlerts = alerts.filter((alert) => alert.severity === 'risk').length;
  const watchAlerts = alerts.filter((alert) => alert.severity === 'watch').length;
  const assetCount = aggregate.assets?.length || 0;
  const walletCount = aggregate.successfulWalletCount || 0;

  let score = 70;
  score += Math.min(assetCount, 6) * 2;
  score += walletCount > 1 ? 4 : 0;
  score += Math.min(pricedCoverage, 100) * 0.12;
  score += stablePct >= 20 && stablePct <= 80 ? 8 : -6;
  score -= concentrationPct > 50 ? (concentrationPct - 50) * 0.45 : 0;
  score -= volatilePct > 50 ? (volatilePct - 50) * 0.35 : 0;
  score -= riskAlerts * 10 + watchAlerts * 4;
  if (treasuryValue <= 0) score = Math.min(score, 45);

  const finalScore = clamp(score);
  const status = finalScore >= 85 ? 'Excellent' : finalScore >= 70 ? 'Good' : finalScore >= 50 ? 'Watch' : 'High Risk';
  const strengths = [];
  const risks = [];
  if (pricedCoverage >= 90) strengths.push('High pricing coverage across visible asset types.'); else risks.push('Some visible assets lack reliable USD pricing.');
  if (stablePct >= 20 && stablePct <= 80) strengths.push('Supported stablecoin allocation is within WealthView readiness range.'); else risks.push('Supported stablecoin allocation is outside WealthView readiness range.');
  if (concentrationPct <= 50) strengths.push('No single priced asset dominates the treasury.'); else risks.push(`${top?.code || 'Top asset'} concentration is elevated.`);
  if (walletCount > 1) strengths.push('Multiple wallets are consolidated into one read-only view.');

  return {
    score: finalScore,
    status,
    strengths,
    risks,
    explanation: 'Score uses diversification, concentration, liquidity, supported stablecoin and volatile exposure, idle capital, pricing coverage, wallet count, and detected alerts from the current aggregate result.'
  };
}

export function ruleBasedBenchmarks(aggregate, health) {
  const treasuryValue = aggregate.totalUSD || 0;
  const stablePct = pct(stableValue(aggregate), treasuryValue);
  const top = topPricedAsset(aggregate);
  const coverage = aggregate.pricingCoveragePct || 0;
  const label = (score) => score >= 80 ? 'Strong' : score >= 60 ? 'Ready' : score >= 40 ? 'Watch' : 'Needs review';
  const items = [
    { category: 'Diversification', score: clamp(100 - Math.max(0, allocation(top) - 25)), explanation: 'Compared against WealthView treasury-readiness rules.' },
    { category: 'Liquidity', score: clamp(stablePct + Math.min(40, (aggregate.totalXLM || 0) > 0 ? 20 : 0)), explanation: 'Compared against WealthView treasury-readiness rules.' },
    { category: 'Concentration Risk', score: clamp(100 - allocation(top)), explanation: 'Compared against WealthView treasury-readiness rules.' },
    { category: 'Stablecoin Balance', score: clamp(100 - Math.abs(45 - stablePct) * 1.4), explanation: 'Compared against WealthView treasury-readiness rules.' },
    { category: 'Pricing Coverage', score: clamp(coverage), explanation: 'Compared against WealthView treasury-readiness rules.' },
    { category: 'Treasury Readiness', score: health.score, explanation: 'Compared against WealthView treasury-readiness rules.' }
  ];
  return items.map((item) => ({ ...item, label: label(item.score) }));
}

export function simulationDefaults(aggregate) {
  const top = topPricedAsset(aggregate);
  return {
    xlmPriceChangePct: -10,
    stablecoinDepegPct: -2,
    topAssetDeclinePct: -15,
    reallocationPct: 10,
    topAssetCode: top?.code || null,
    disclaimer: 'Simulation is an estimate based on current visible balances and prices. It is not financial advice.'
  };
}

export function runSimulation(aggregate, params = simulationDefaults(aggregate)) {
  const treasuryValue = aggregate.totalUSD || 0;
  const xlm = (aggregate.assets || []).find((asset) => asset.code === 'XLM');
  const stable = stableValue(aggregate);
  const top = topPricedAsset(aggregate);
  const xlmImpact = pricedValue(xlm || {}) * (Number(params.xlmPriceChangePct || 0) / 100);
  const stableImpact = stable * (Number(params.stablecoinDepegPct || 0) / 100);
  const topImpact = pricedValue(top || {}) * (Number(params.topAssetDeclinePct || 0) / 100);
  const reallocationImpact = Math.max(0, volatileValue(aggregate) * (Number(params.reallocationPct || 0) / 100)) * 0.02;
  const estimatedValue = Number((treasuryValue + xlmImpact + stableImpact + topImpact + reallocationImpact).toFixed(2));
  return {
    estimatedTreasuryValueUSD: estimatedValue,
    estimatedGainLossUSD: Number((estimatedValue - treasuryValue).toFixed(2)),
    affectedAssets: [xlm?.code, 'Supported stablecoins', top?.code].filter(Boolean),
    explanation: 'Client-side what-if estimate using current visible priced balances and user-selected scenario inputs.',
    disclaimer: 'Simulation is an estimate based on current visible balances and prices. It is not financial advice.'
  };
}

export function executiveBrief(aggregate, health, idleCapital, alerts, changes = null) {
  const materialAlerts = alerts.filter((alert) => alert.severity === 'risk' || alert.severity === 'watch').slice(0, 3);
  const biggestStrength = health.strengths[0] || 'The treasury is visible through read-only Stellar aggregation.';
  const biggestRisk = health.risks[0] || materialAlerts[0]?.title || 'No major rule-based risk is currently highlighted.';
  const changeLine = changes?.available
    ? `Since the uploaded snapshot, priced value changed by ${usd(changes.totalUSDChange)} (${changes.totalUSDChangePct}%).`
    : 'No previous snapshot was uploaded, so change detection is not available.';
  return [
    `Executive Treasury Brief — ${aggregate.timestamp}`,
    `Current priced treasury value: ${usd(aggregate.totalUSD)} across ${aggregate.successfulWalletCount || 0} queried wallet(s).`,
    `Treasury health: ${health.score}/100 (${health.status}).`,
    `Biggest strength: ${biggestStrength}`,
    `Biggest risk: ${biggestRisk}`,
    `Potentially idle capital flagged for review: ${usd(idleCapital.idleCapitalUSD)} (${idleCapital.idleCapitalPercent}%).`,
    `Key alerts: ${materialAlerts.length ? materialAlerts.map((alert) => alert.title).join('; ') : 'No material risk/watch alerts.'}`,
    `Change summary: ${changeLine}`,
    `Recommended next actions: ${idleCapital.suggestedReviewAction} Export this snapshot and review unpriced assets before treasury decisions.`,
    'This brief is generated from current visible Stellar aggregation results and is not financial advice.'
  ].join('\n');
}

function signalsFromAlerts(alerts) {
  return alerts.slice(0, 8).map((alert) => ({
    severity: alert.severity,
    title: alert.title,
    explanation: alert.explanation,
    suggestedAction: alert.suggestedAction
  }));
}

export function buildIntelligence(aggregate, { previousSnapshot = null } = {}) {
  const changeDetection = detectSnapshotChanges(aggregate, previousSnapshot);
  const idleCapital = detectIdleCapital(aggregate);
  const preliminaryAlerts = createAlerts(aggregate, changeDetection, idleCapital);
  const treasuryHealth = treasuryHealthScore(aggregate, preliminaryAlerts);
  const alerts = createAlerts(aggregate, changeDetection, idleCapital);
  const benchmarks = ruleBasedBenchmarks(aggregate, treasuryHealth);
  const signals = signalsFromAlerts(alerts);
  return {
    success: aggregate.success,
    timestamp: aggregate.timestamp,
    aggregate,
    treasuryHealth,
    idleCapital,
    alerts,
    benchmarks,
    signals,
    changeDetectionAvailable: changeDetection.available,
    changeDetection,
    executiveBrief: executiveBrief(aggregate, treasuryHealth, idleCapital, alerts, changeDetection),
    simulationDefaults: simulationDefaults(aggregate),
    simulation: runSimulation(aggregate),
    warnings: aggregate.warnings || [],
    errors: aggregate.errors || []
  };
}

export function buildSignals(aggregate) {
  const changeDetection = detectSnapshotChanges(aggregate, null);
  const idleCapital = detectIdleCapital(aggregate);
  const alerts = createAlerts(aggregate, changeDetection, idleCapital);
  return signalsFromAlerts(alerts);
}
