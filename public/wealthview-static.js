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
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const wallets = params.get('wallets') || '';
  const contracts = params.get('contracts') || params.get('sep41') || '';
  if (wallets) $('wallets').value = wallets.replaceAll(',', '\n');
  if (contracts) $('contracts').value = contracts.replaceAll(',', '\n');
}

function validateInputs() {
  const wallets = splitInput($('wallets').value);
  const contracts = splitInput($('contracts').value);
  const errors = [];
  if (!wallets.length) errors.push('Enter at least one Stellar public wallet address.');
  wallets.forEach((wallet) => { if (!walletPattern.test(wallet)) errors.push(`${wallet} is not a valid Stellar G... public key.`); });
  contracts.forEach((contract) => { if (!contractPattern.test(contract)) errors.push(`${contract} is not a valid SEP-41/Soroban C... contract ID.`); });
  $('input-errors').innerHTML = errors.map((error) => `<p class="notice risk">${escapeHtml(error)}</p>`).join('');
  return { errors, wallets, contracts };
}

async function postJson(url, payload) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return response.json();
}

async function runAggregation() {
  const validation = validateInputs();
  if (validation.errors.some((error) => error.includes('Enter at least'))) return;
  $('run').textContent = 'Aggregating…';
  $('run').disabled = true;
  try {
    const payload = { wallets: $('wallets').value, contracts: $('contracts').value };
    aggregate = await postJson('/api/aggregate', payload);
    intelligence = await postJson('/api/intelligence', { ...payload, previousSnapshot });
    simulation = intelligence.simulationDefaults || simulation;
    renderAll();
  } catch (error) {
    $('input-errors').innerHTML = `<p class="notice risk">Aggregation failed: ${escapeHtml(error.message)}</p>`;
  } finally {
    $('run').disabled = false;
    $('run').textContent = 'Run Read-Only Aggregation';
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
  $('overview').classList.remove('hidden');
  $('overview').innerHTML = [
    ['Priced Treasury Value', fmtUSD(aggregate.totalUSD), 'Unpriced assets excluded'],
    ['Total XLM', numberFmt.format(aggregate.totalXLM || 0), 'Native balances aggregated'],
    ['Wallets Queried', `${aggregate.successfulWalletCount || 0}/${aggregate.walletCount || 0}`, 'Per-wallet errors shown below'],
    ['Pricing Coverage', fmtPct(aggregate.pricingCoveragePct || 0), `${aggregate.unpricedAssets?.length || 0} unpriced asset types`]
  ].map(([title, value, note]) => `<article class="card metric"><span>${title}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
}

function renderDetails() {
  $('details').classList.remove('hidden');
  const assets = (aggregate.assets || []).map((asset) => `<div class="asset"><div><strong>${escapeHtml(asset.type === 'native' ? 'XLM' : asset.code)}</strong><span>${escapeHtml(asset.type)} · ${escapeHtml(asset.priceSource || 'unpriced')}</span></div><div><strong>${asset.priced ? fmtUSD(asset.valueUsd) : 'Unpriced'}</strong><span>${numberFmt.format(asset.balance || 0)} · ${fmtPct(asset.allocationPct || 0)}</span></div></div>`).join('') || '<p class="muted">No assets returned yet.</p>';
  const wallets = (aggregate.wallets || []).map((wallet) => `<div class="wallet"><code>${escapeHtml(wallet.wallet.slice(0, 8))}…${escapeHtml(wallet.wallet.slice(-6))}</code><span>${numberFmt.format(wallet.totalXLM || 0)} XLM</span><span>${wallet.assetCount || 0} assets</span></div>`).join('') || '<p class="muted">No wallet was successfully queried.</p>';
  const unpriced = aggregate.unpricedAssets?.length ? aggregate.unpricedAssets.map((asset) => `<p class="pill risk">${escapeHtml(asset.code)} is unpriced and excluded from USD totals.</p>`).join('') : '<p class="pill good">All visible asset types have pricing labels.</p>';
  const messages = [...(aggregate.errors || []).map((error) => `${error.wallet || 'Input'}: ${error.message}`), ...(aggregate.warnings || []).map((warning) => warning.message)];
  $('details').innerHTML = `<div class="card"><h2>Asset Allocation</h2>${assets}</div><div class="card"><h2>Wallet Summary</h2>${wallets}</div><div class="card"><h2>Pricing Coverage & Unpriced Assets</h2><p class="muted">Stablecoins use explicit approximate fiat peg labels. Unknown assets are never silently priced.</p>${unpriced}</div><div class="card"><h2>Errors / Warnings</h2>${messages.length ? messages.map((message) => `<p class="notice watch">${escapeHtml(message)}</p>`).join('') : '<p class="pill good">No errors or warnings.</p>'}</div>`;
}

function currentSnapshot() {
  return { product: 'WealthView.pro', type: 'stellar-treasury-snapshot', timestamp: new Date().toISOString(), aggregate, intelligence, alerts: intelligence?.alerts || [], executiveBrief: intelligence?.executiveBrief || '' };
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
  if (!aggregate) return { value: 0, change: 0 };
  const nav = aggregate.totalUSD || 0;
  const xlm = aggregate.assets?.find((asset) => asset.code === 'XLM')?.valueUsd || 0;
  const stables = aggregate.assets?.filter((asset) => ['USDC', 'USDZ', 'EURC', 'EURX', 'GBPX'].includes(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + (asset.valueUsd || 0), 0) || 0;
  const top = [...(aggregate.assets || [])].filter((asset) => Number.isFinite(asset.valueUsd)).sort((a, b) => b.valueUsd - a.valueUsd)[0];
  const volatile = aggregate.assets?.filter((asset) => ['XLM', 'AQUA'].includes(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + (asset.valueUsd || 0), 0) || 0;
  const nextValue = nav + xlm * (simulation.xlmPriceChangePct / 100) + stables * (simulation.stablecoinDepegPct / 100) + (top?.valueUsd || 0) * (simulation.topAssetDeclinePct / 100) + volatile * (simulation.reallocationPct / 100) * 0.02;
  return { value: nextValue, change: nextValue - nav };
}

function renderIntelligence() {
  $('intelligence').classList.remove('hidden');
  const sim = simulateValue();
  const change = intelligence.changeDetection;
  $('intelligence').innerHTML = `
    <div class="actions"><div><p class="eyebrow">Treasury Intelligence</p><h2>${intelligence.treasuryHealth?.score}/100 · ${escapeHtml(intelligence.treasuryHealth?.status)}</h2></div><button id="brief-btn">Generate Executive Brief</button></div>
    <p>${escapeHtml(intelligence.treasuryHealth?.explanation || '')}</p>
    <div class="grid three"><div><h3>Strengths</h3>${(intelligence.treasuryHealth?.strengths || []).map((item) => `<p class="pill good">${escapeHtml(item)}</p>`).join('')}</div><div><h3>Risks</h3>${(intelligence.treasuryHealth?.risks || []).map((item) => `<p class="pill risk">${escapeHtml(item)}</p>`).join('')}</div><div><h3>Idle Capital Detection</h3><p class="big">${fmtUSD(intelligence.idleCapital?.idleCapitalUSD || 0)}</p><p>${escapeHtml(intelligence.idleCapital?.explanation || '')}</p></div></div>
    <h3>Treasury Alerts</h3><div class="alerts">${(intelligence.alerts || []).map((alert) => `<div class="alert ${escapeHtml(alert.severity)}"><strong>${escapeHtml(alert.title)}</strong><p>${escapeHtml(alert.explanation)}</p><small>${escapeHtml(alert.suggestedAction)}</small></div>`).join('')}</div>
    <h3>Rule-Based Benchmarking</h3><div class="benchmarks">${(intelligence.benchmarks || []).map((bench) => `<div class="alert"><strong>${escapeHtml(bench.category)}</strong><span>${bench.score}/100 · ${escapeHtml(bench.label)}</span><p>${escapeHtml(bench.explanation)}</p></div>`).join('')}</div>
    <div class="grid two"><div class="subcard"><h3>Changes Since Previous Snapshot</h3><input id="snapshot-upload" type="file" accept="application/json" /><div>${change?.available ? `<p>Total USD change: <strong>${fmtUSD(change.totalUSDChange)}</strong> (${fmtPct(change.totalUSDChangePct)})</p><p>Total XLM change: <strong>${numberFmt.format(change.totalXLMChange || 0)}</strong></p><p>New assets: ${escapeHtml(change.newAssets?.join(', ') || 'None')}</p><p>Removed assets: ${escapeHtml(change.removedAssets?.join(', ') || 'None')}</p>` : '<p class="muted">Upload a previous snapshot to detect treasury changes.</p>'}</div></div><div class="subcard"><h3>Snapshot Export</h3><p>Timestamped snapshot includes aggregate data, intelligence, alerts, and executive brief.</p><button id="download-snapshot">Download Treasury Snapshot</button><button id="export-json" class="secondary">Export JSON</button></div></div>
    <div class="subcard"><h3>Treasury Simulation</h3><div class="sim-grid">${['xlmPriceChangePct','stablecoinDepegPct','topAssetDeclinePct','reallocationPct'].map((key) => `<label>${key.replace(/([A-Z])/g, ' $1')}<input class="sim" data-key="${key}" type="number" value="${simulation[key]}" /></label>`).join('')}</div><p class="big">Estimated value: ${fmtUSD(sim.value)} (${fmtUSD(sim.change)})</p><p class="muted">Simulation is an estimate based on current visible balances and prices. It is not financial advice.</p></div>
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
