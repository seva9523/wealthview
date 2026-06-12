const walletPattern = /^G[A-Z2-7]{55}$/;
const contractPattern = /^C[A-Z2-7]{55}$/;
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 7 });
let aggregate = null;
let intelligence = null;
let previousSnapshot = null;
let simulation = { xlmPriceChangePct: -10, stablecoinDepegPct: -2, topAssetDeclinePct: -15, reallocationPct: 10 };

const $ = (id) => document.getElementById(id);
const splitInput = (value) => String(value || '').split(/[\n,;\s]+/).map((item) => item.trim()).filter(Boolean);
const fmtUSD = (value) => currency.format(Number(value || 0));
const fmtPct = (value) => `${Number(value || 0).toFixed(2)}%`;
const assetValue = (asset) => Number.isFinite(asset?.usdValue) ? asset.usdValue : asset?.valueUsd;
const assetAmount = (asset) => Number(asset?.amount ?? asset?.balance ?? 0);
const assetAllocation = (asset) => Number(asset?.allocationPercent ?? asset?.allocationPct ?? 0);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const walletParam = params.get('wallets') || '';
  const contractParam = params.get('contracts') || params.get('sep41') || '';
  if (walletParam) $('wallets').value = walletParam.replaceAll(',', '\n');
  if (contractParam) $('contracts').value = contractParam.replaceAll(',', '\n');
}

function validateInputs() {
  const wallets = splitInput($('wallets').value);
  const contracts = splitInput($('contracts').value);
  const errors = [];
  if (!wallets.length) errors.push('Enter at least one Stellar public wallet address.');
  wallets.forEach((wallet) => { if (!walletPattern.test(wallet)) errors.push(`${wallet} is not a valid Stellar G... public key.`); });
  contracts.forEach((contract) => { if (!contractPattern.test(contract)) errors.push(`${contract} is not a valid SEP-41/Soroban C... contract ID. It will be reported as a non-fatal warning by the API.`); });
  $('input-errors').innerHTML = errors.map((error) => `<p class="notice risk">${escapeHtml(error)}</p>`).join('');
  return { errors, wallets, contracts };
}

async function postJson(url, payload) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return response.json();
}

function hideResultSections() {
  ['overview', 'details', 'intelligence'].forEach((id) => $(id).classList.add('hidden'));
  $('empty-state').classList.remove('hidden');
}

async function runAggregation() {
  const validation = validateInputs();
  if (!validation.wallets.length) return;
  $('run').textContent = 'Analyzing…';
  $('run').disabled = true;
  try {
    const payload = { wallets: $('wallets').value, contracts: $('contracts').value };
    const aggregateResult = await postJson('/api/aggregate', payload);
    if (!aggregateResult.success) {
      aggregate = null;
      intelligence = null;
      hideResultSections();
      const messages = [...(aggregateResult.errors || []), ...(aggregateResult.warnings || [])].map((item) => `${item.wallet || item.contractId || 'Input'}: ${item.message}`);
      $('input-errors').innerHTML += messages.map((message) => `<p class="notice watch">${escapeHtml(message)}</p>`).join('');
      return;
    }
    aggregate = aggregateResult;
    intelligence = await postJson('/api/intelligence', { ...payload, previousSnapshot });
    simulation = intelligence.simulationDefaults || simulation;
    renderAll();
  } catch (error) {
    aggregate = null;
    intelligence = null;
    hideResultSections();
    $('input-errors').innerHTML = `<p class="notice risk">Analysis failed: ${escapeHtml(error.message)}</p>`;
  } finally {
    $('run').disabled = false;
    $('run').textContent = 'Analyze Treasury';
  }
}

function generateShareLink() {
  const params = new URLSearchParams();
  if ($('wallets').value.trim()) params.set('wallets', splitInput($('wallets').value).join(','));
  if ($('contracts').value.trim()) params.set('contracts', splitInput($('contracts').value).join(','));
  const link = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', link);
  navigator.clipboard?.writeText(link);
  $('share').textContent = 'Generate Share Link ✓';
}

function renderOverview() {
  $('empty-state').classList.add('hidden');
  $('overview').classList.remove('hidden');
  $('overview').innerHTML = [
    ['Total Treasury Value', fmtUSD(aggregate.totalUSD), 'Only priced assets included'],
    ['Total XLM', numberFmt.format(aggregate.totalXLM || 0), 'Native balances aggregated'],
    ['Wallet Count', `${aggregate.successfulWalletCount || 0}/${aggregate.walletCount || 0}`, 'Mixed input supported'],
    ['Pricing Coverage', fmtPct(aggregate.pricingCoveragePct || 0), `${aggregate.unpricedAssets?.length || 0} unpriced asset types`]
  ].map(([title, value, note]) => `<article class="card metric"><span>${title}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
}

function renderDetails() {
  $('details').classList.remove('hidden');
  const assets = (aggregate.assets || []).map((asset) => `<div class="asset"><div><strong>${escapeHtml(asset.type === 'native' ? 'XLM' : asset.symbol || asset.code)}</strong><span>${escapeHtml(asset.type)} · ${escapeHtml(asset.pricingSource || asset.priceSource || 'unpriced')}</span></div><div><strong>${Number.isFinite(assetValue(asset)) ? fmtUSD(assetValue(asset)) : 'Unpriced'}</strong><span>${numberFmt.format(assetAmount(asset))} · ${fmtPct(assetAllocation(asset))}</span></div></div>`).join('') || '<p class="muted">No assets returned.</p>';
  const wallets = (aggregate.wallets || []).map((wallet) => `<div class="wallet"><code>${escapeHtml(wallet.wallet.slice(0, 8))}…${escapeHtml(wallet.wallet.slice(-6))}</code><span>${numberFmt.format(wallet.totalXLM || 0)} XLM</span><span>${wallet.assetCount || 0} assets</span></div>`).join('') || '<p class="muted">No wallet was successfully queried.</p>';
  const unpriced = aggregate.unpricedAssets?.length ? aggregate.unpricedAssets.map((asset) => `<p class="pill risk">${escapeHtml(asset.code)} is unpriced and excluded from USD totals.</p>`).join('') : '<p class="pill good">All visible asset types have pricing labels.</p>';
  const messages = [...(aggregate.errors || []).map((error) => `${error.wallet || 'Input'}: ${error.message}`), ...(aggregate.warnings || []).map((warning) => warning.message)];
  $('details').innerHTML = `<div class="card"><h2>Asset Allocation</h2>${assets}</div><div class="card"><h2>Wallet-Level Summary</h2>${wallets}</div><div class="card"><h2>Pricing Coverage & Unpriced Assets</h2><p class="muted">Supported stablecoins use explicit approximate peg/fx labels. Unknown assets are never silently priced.</p>${unpriced}</div><div class="card"><h2>Errors / Warnings</h2>${messages.length ? messages.map((message) => `<p class="notice watch">${escapeHtml(message)}</p>`).join('') : '<p class="pill good">No errors or warnings.</p>'}</div>`;
}

function currentSnapshot() {
  return { product: 'WealthView.pro', type: 'stellar-treasury-snapshot', timestamp: new Date().toISOString(), walletInput: $('wallets').value, contractInput: $('contracts').value, aggregate, pricing: aggregate?.pricing, treasurySignals: intelligence?.signals || [], treasuryIntelligence: intelligence, alerts: intelligence?.alerts || [], executiveBrief: document.getElementById('brief')?.classList.contains('hidden') ? null : intelligence?.executiveBrief || null };
}

function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function simulateValue() {
  const treasuryValue = aggregate.totalUSD || 0;
  const xlm = assetValue(aggregate.assets?.find((asset) => asset.code === 'XLM')) || 0;
  const supportedStables = aggregate.assets?.filter((asset) => ['USDC', 'USDZ', 'EURC', 'EURX', 'GBPX'].includes(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + (assetValue(asset) || 0), 0) || 0;
  const top = [...(aggregate.assets || [])].filter((asset) => Number.isFinite(assetValue(asset))).sort((a, b) => assetValue(b) - assetValue(a))[0];
  const volatile = aggregate.assets?.filter((asset) => ['XLM', 'AQUA'].includes(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + (assetValue(asset) || 0), 0) || 0;
  const nextValue = treasuryValue + xlm * (simulation.xlmPriceChangePct / 100) + supportedStables * (simulation.stablecoinDepegPct / 100) + (assetValue(top) || 0) * (simulation.topAssetDeclinePct / 100) + volatile * (simulation.reallocationPct / 100) * 0.02;
  return { value: nextValue, change: nextValue - treasuryValue };
}

function renderIntelligence() {
  $('intelligence').classList.remove('hidden');
  const sim = simulateValue();
  const change = intelligence.changeDetection;
  $('intelligence').innerHTML = `
    <h2>Treasury Signals</h2><div class="alerts">${(intelligence.signals || []).map((signal) => `<div class="alert ${escapeHtml(signal.severity)}"><strong>${escapeHtml(signal.title)}</strong><p>${escapeHtml(signal.explanation)}</p></div>`).join('')}</div>
    <div class="actions"><div><p class="eyebrow">Treasury Intelligence</p><h2>${intelligence.treasuryHealth?.score}/100 · ${escapeHtml(intelligence.treasuryHealth?.status)}</h2></div><button id="brief-btn">Generate Executive Brief</button></div>
    <p>${escapeHtml(intelligence.treasuryHealth?.explanation || '')}</p>
    <div class="grid three"><div><h3>Strengths</h3>${(intelligence.treasuryHealth?.strengths || []).map((item) => `<p class="pill good">${escapeHtml(item)}</p>`).join('')}</div><div><h3>Risks</h3>${(intelligence.treasuryHealth?.risks || []).map((item) => `<p class="pill risk">${escapeHtml(item)}</p>`).join('')}</div><div><h3>Idle Capital Detection</h3><p class="big">${fmtUSD(intelligence.idleCapital?.idleCapitalUSD || 0)}</p><p>${escapeHtml(intelligence.idleCapital?.explanation || '')}</p></div></div>
    <h3>Treasury Alerts</h3><div class="alerts">${(intelligence.alerts || []).map((alert) => `<div class="alert ${escapeHtml(alert.severity)}"><strong>${escapeHtml(alert.title)}</strong><p>${escapeHtml(alert.explanation)}</p><small>${escapeHtml(alert.suggestedAction)}</small></div>`).join('')}</div>
    <h3>Rule-Based Benchmarking</h3><div class="benchmarks">${(intelligence.benchmarks || []).map((bench) => `<div class="alert"><strong>${escapeHtml(bench.category)}</strong><span>${bench.score}/100 · ${escapeHtml(bench.label)}</span><p>${escapeHtml(bench.explanation)}</p></div>`).join('')}</div>
    <div class="grid two"><div class="subcard"><h3>Changes Since Previous Snapshot</h3><input id="snapshot-upload" type="file" accept="application/json" /><div>${change?.available ? `<p>Total USD change: <strong>${fmtUSD(change.totalUSDChange)}</strong> (${fmtPct(change.totalUSDChangePct)})</p><p>Total XLM change: <strong>${numberFmt.format(change.totalXLMChange || 0)}</strong></p><p>New assets: ${escapeHtml(change.newAssets?.join(', ') || 'None')}</p><p>Removed assets: ${escapeHtml(change.removedAssets?.join(', ') || 'None')}</p>` : '<p class="muted">Upload a previous snapshot to detect treasury changes.</p>'}</div></div><div class="subcard"><h3>Snapshot Export</h3><p>Snapshot includes timestamp, wallet input, contract input, aggregate data, pricing, signals, intelligence, alerts, and executive brief if generated.</p><button id="download-snapshot">Download Treasury Snapshot</button><button id="export-json" class="secondary">Export JSON</button></div></div>
    <div class="subcard"><h3>Treasury Simulation</h3><div class="sim-grid">${['xlmPriceChangePct','stablecoinDepegPct','topAssetDeclinePct','reallocationPct'].map((key) => `<label>${key.replace(/([A-Z])/g, ' $1')}<input class="sim" data-key="${key}" type="number" value="${simulation[key]}" /></label>`).join('')}</div><p class="big">Estimated new treasury value: ${fmtUSD(sim.value)} (${fmtUSD(sim.change)})</p><p class="muted">Simulation is an estimate based on current visible balances and prices. It is not financial advice.</p></div>
    <div id="brief" class="subcard hidden"><h3>Executive Treasury Brief</h3><pre>${escapeHtml(intelligence.executiveBrief || '')}</pre><button id="copy-brief">Copy brief</button><button id="download-brief" class="secondary">Download .txt</button></div>`;
  wireDynamicControls();
}

function wireDynamicControls() {
  $('download-snapshot')?.addEventListener('click', () => download(`wealthview-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(currentSnapshot(), null, 2)));
  $('export-json')?.addEventListener('click', () => download(`wealthview-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(currentSnapshot(), null, 2)));
  $('brief-btn')?.addEventListener('click', () => $('brief').classList.remove('hidden'));
  $('copy-brief')?.addEventListener('click', () => navigator.clipboard?.writeText(intelligence.executiveBrief || ''));
  $('download-brief')?.addEventListener('click', () => download('wealthview-executive-brief.txt', intelligence.executiveBrief || '', 'text/plain'));
  $('snapshot-upload')?.addEventListener('change', async (event) => {
    try {
      previousSnapshot = JSON.parse(await event.target.files[0].text());
      if (!previousSnapshot.aggregate && !Array.isArray(previousSnapshot.assets)) throw new Error('Snapshot does not include aggregate data.');
      await runAggregation();
    } catch (error) {
      alert(`Malformed snapshot upload: ${error.message}`);
    }
  });
  document.querySelectorAll('.sim').forEach((input) => input.addEventListener('input', (event) => { simulation[event.target.dataset.key] = Number(event.target.value); renderIntelligence(); }));
}

function renderAll() {
  renderOverview();
  renderDetails();
  renderIntelligence();
}

$('run').addEventListener('click', runAggregation);
$('share').addEventListener('click', generateShareLink);
document.querySelectorAll('.copy').forEach((button) => button.addEventListener('click', () => navigator.clipboard?.writeText(button.dataset.copy)));
hydrateFromUrl();
