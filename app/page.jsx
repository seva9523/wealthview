'use client';

import { useEffect, useMemo, useState } from 'react';

const walletPattern = /^G[A-Z2-7]{55}$/;
const contractPattern = /^C[A-Z2-7]{55}$/;
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 7 });

function splitInput(value) { return String(value || '').split(/[\n,;\s]+/).map((item) => item.trim()).filter(Boolean); }
function fmtUSD(value) { return currency.format(Number(value || 0)); }
function fmtPct(value) { return `${Number(value || 0).toFixed(2)}%`; }
function assetValue(asset) { return Number.isFinite(asset?.usdValue) ? asset.usdValue : asset?.valueUsd; }
function assetAmount(asset) { return Number(asset?.amount ?? asset?.balance ?? 0); }
function assetAllocation(asset) { return Number(asset?.allocationPercent ?? asset?.allocationPct ?? 0); }
function assetLabel(asset) { return asset.type === 'native' ? 'XLM' : `${asset.symbol || asset.code}${asset.issuer ? `:${asset.issuer.slice(0, 5)}…` : asset.contractId ? `:${asset.contractId.slice(0, 5)}…` : ''}`; }
function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [wallets, setWallets] = useState('');
  const [contracts, setContracts] = useState('');
  const [aggregate, setAggregate] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [inputErrors, setInputErrors] = useState([]);
  const [analysisMessages, setAnalysisMessages] = useState([]);
  const [shareOk, setShareOk] = useState(false);
  const [previousSnapshot, setPreviousSnapshot] = useState(null);
  const [snapshotError, setSnapshotError] = useState('');
  const [briefVisible, setBriefVisible] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');
  const [simulation, setSimulation] = useState({ xlmPriceChangePct: -10, stablecoinDepegPct: -2, topAssetDeclinePct: -15, reallocationPct: 10 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const walletParam = params.get('wallets') || '';
    const contractParam = params.get('contracts') || params.get('sep41') || '';
    if (walletParam) setWallets(walletParam.replaceAll(',', '\n'));
    if (contractParam) setContracts(contractParam.replaceAll(',', '\n'));
  }, []);

  const validation = useMemo(() => {
    const walletList = splitInput(wallets);
    const contractList = splitInput(contracts);
    const errors = [];
    if (!walletList.length) errors.push('Enter at least one Stellar public wallet address.');
    for (const wallet of walletList) if (!walletPattern.test(wallet)) errors.push(`${wallet} is not a valid Stellar G... public key.`);
    for (const contract of contractList) if (!contractPattern.test(contract)) errors.push(`${contract} is not a valid SEP-41/Soroban C... contract ID. It will be reported as a non-fatal warning by the API.`);
    return { walletList, contractList, errors };
  }, [wallets, contracts]);

  const hasSuccessfulAnalysis = Boolean(aggregate?.success && intelligence?.success);

  async function runAggregation() {
    setInputErrors(validation.errors);
    setAnalysisMessages([]);
    setShareOk(false);
    setBriefVisible(false);
    setCopyNotice('');
    if (!validation.walletList.length) return;
    setLoading(true);
    try {
      const payload = { wallets, contracts };
      const aggregateResponse = await fetch('/api/aggregate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const aggregateData = await aggregateResponse.json();
      if (!aggregateData.success) {
        setAggregate(null);
        setIntelligence(null);
        setAnalysisMessages([...(aggregateData.errors || []), ...(aggregateData.warnings || [])].map((item) => `${item.wallet || item.contractId || 'Input'}: ${item.message}`));
        return;
      }
      const intelligenceResponse = await fetch('/api/intelligence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, previousSnapshot }) });
      const intelligenceData = await intelligenceResponse.json();
      setAggregate(aggregateData);
      setIntelligence(intelligenceData);
      setSimulation(intelligenceData.simulationDefaults || simulation);
    } catch (error) {
      setAggregate(null);
      setIntelligence(null);
      setAnalysisMessages([`Analysis failed: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  }

  function generateShareLink() {
    const params = new URLSearchParams();
    if (wallets.trim()) params.set('wallets', splitInput(wallets).join(','));
    if (contracts.trim()) params.set('contracts', splitInput(contracts).join(','));
    const link = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard?.writeText(link);
    window.history.replaceState({}, '', link);
    setShareOk(true);
  }

  const snapshot = useMemo(() => hasSuccessfulAnalysis ? {
    product: 'WealthView.pro',
    type: 'stellar-treasury-snapshot',
    timestamp: new Date().toISOString(),
    walletInput: wallets,
    contractInput: contracts,
    aggregate,
    pricing: aggregate.pricing,
    treasurySignals: intelligence.signals,
    treasuryIntelligence: intelligence,
    alerts: intelligence.alerts,
    executiveBrief: briefVisible ? intelligence.executiveBrief : null
  } : null, [hasSuccessfulAnalysis, wallets, contracts, aggregate, intelligence, briefVisible]);

  function exportJson(kind) {
    if (!snapshot) return;
    download(`wealthview-${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(snapshot, null, 2));
  }

  async function uploadSnapshot(event) {
    const file = event.target.files?.[0];
    setSnapshotError('');
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!json.aggregate && !Array.isArray(json.assets)) throw new Error('Snapshot does not include aggregate data.');
      setPreviousSnapshot(json);
      if (aggregate?.success) {
        const response = await fetch('/api/intelligence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallets, contracts, previousSnapshot: json }) });
        setIntelligence(await response.json());
      }
    } catch (error) {
      setSnapshotError(`Malformed snapshot upload: ${error.message}`);
    }
  }

  const simulated = useMemo(() => {
    if (!hasSuccessfulAnalysis) return null;
    const treasuryValue = aggregate.totalUSD || 0;
    const xlm = assetValue(aggregate.assets?.find((asset) => asset.code === 'XLM')) || 0;
    const supportedStables = aggregate.assets?.filter((asset) => ['USDC', 'USDZ', 'EURC', 'EURX', 'GBPX'].includes(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + (assetValue(asset) || 0), 0) || 0;
    const top = [...(aggregate.assets || [])].filter((asset) => Number.isFinite(assetValue(asset))).sort((a, b) => assetValue(b) - assetValue(a))[0];
    const volatile = aggregate.assets?.filter((asset) => ['XLM', 'AQUA'].includes(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + (assetValue(asset) || 0), 0) || 0;
    const nextValue = treasuryValue + xlm * (simulation.xlmPriceChangePct / 100) + supportedStables * (simulation.stablecoinDepegPct / 100) + (assetValue(top) || 0) * (simulation.topAssetDeclinePct / 100) + volatile * (simulation.reallocationPct / 100) * 0.02;
    return { estimatedTreasuryValueUSD: nextValue, estimatedGainLossUSD: nextValue - treasuryValue, affectedAssets: ['XLM', 'Supported stablecoins', top?.code].filter(Boolean) };
  }, [hasSuccessfulAnalysis, aggregate, simulation]);

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Read-only Stellar treasury intelligence</div>
        <h1>WealthView.pro for builders, startups, DAOs, funds, treasury teams, and AI agents.</h1>
        <p>Analyze public Stellar wallets, classic trustline assets, and optional SEP-41/Soroban contract IDs. WealthView is not a generic dashboard, wallet connection product, trading app, custody app, login system, subscription service, or database-backed tracker.</p>
        <div className="heroBadges"><span>Horizon-backed</span><span>No signing</span><span>No custody</span><span>Agent-ready APIs</span></div>
      </section>

      <section className="grid two">
        <div className="card inputCard">
          <h2>Wallet Input</h2>
          <label>Stellar public wallets</label>
          <textarea value={wallets} onChange={(event) => setWallets(event.target.value)} placeholder="G...\nG... or comma-separated" rows={6} />
          <label>Optional SEP-41 / Soroban contract IDs</label>
          <textarea value={contracts} onChange={(event) => setContracts(event.target.value)} placeholder="C... optional, comma-separated or line-separated" rows={3} />
          <div className="actions">
            <button onClick={runAggregation} disabled={loading}>{loading ? 'Analyzing…' : 'Analyze Treasury'}</button>
            <button className="secondary" onClick={generateShareLink}>Generate Share Link {shareOk ? '✓' : ''}</button>
          </div>
          <p className="muted">Read-only mode: WealthView only reads public network data. It never connects wallets, requests signatures, submits transactions, trades assets, takes custody, or requires login.</p>
          {!!inputErrors.length && <div className="notice risk">{inputErrors.map((error) => <p key={error}>{error}</p>)}</div>}
          {!!analysisMessages.length && <div className="notice watch">{analysisMessages.map((message) => <p key={message}>{message}</p>)}</div>}
        </div>

        <DeveloperApiCard />
      </section>

      {!hasSuccessfulAnalysis && <section className="card emptyState"><h2>Enter Stellar wallets to generate live treasury intelligence.</h2><p>After you click Analyze Treasury and `/api/aggregate` returns a successful live wallet result, WealthView will show treasury value, XLM totals, allocation, pricing coverage, signals, intelligence, snapshots, simulations, and an executive brief.</p></section>}

      {hasSuccessfulAnalysis && <>
        <section className="grid four overview">
          <Metric title="Total Treasury Value" value={fmtUSD(aggregate.totalUSD)} note="Only priced assets included" />
          <Metric title="Total XLM" value={numberFmt.format(aggregate.totalXLM)} note="Native balances aggregated" />
          <Metric title="Wallet Count" value={`${aggregate.successfulWalletCount}/${aggregate.walletCount}`} note="Mixed input supported" />
          <Metric title="Pricing Coverage" value={fmtPct(aggregate.pricingCoveragePct)} note={`${aggregate.unpricedAssets?.length || 0} unpriced asset types`} />
        </section>

        <section className="grid two">
          <div className="card"><h2>Asset Allocation</h2><div className="assetList">{aggregate.assets?.map((asset) => <div className="asset" key={asset.key}><div><strong>{assetLabel(asset)}</strong><span>{asset.type}{asset.pricingSource ? ` · ${asset.pricingSource}` : ''}</span></div><div><strong>{Number.isFinite(assetValue(asset)) ? fmtUSD(assetValue(asset)) : 'Unpriced'}</strong><span>{numberFmt.format(assetAmount(asset))} · {fmtPct(assetAllocation(asset))}</span></div></div>)}</div></div>
          <div className="card"><h2>Wallet-Level Summary</h2>{aggregate.wallets?.map((wallet) => <div className="walletRow" key={wallet.wallet}><code>{wallet.wallet.slice(0, 8)}…{wallet.wallet.slice(-6)}</code><span>{numberFmt.format(wallet.totalXLM)} XLM</span><span>{wallet.assetCount} assets</span></div>)}</div>
        </section>

        <section className="grid two">
          <div className="card"><h2>Pricing Coverage & Unpriced Assets</h2><p className="muted">Supported stablecoins use explicit approximate peg/fx labels. Unknown assets are never silently priced.</p>{aggregate.unpricedAssets?.length ? aggregate.unpricedAssets.map((asset) => <p key={asset.key} className="pill riskPill">{asset.code} is unpriced and excluded from USD totals.</p>) : <p className="pill goodPill">All visible asset types have pricing labels.</p>}</div>
          <div className="card"><h2>Errors / Warnings</h2>{![...(aggregate.errors || []), ...(aggregate.warnings || [])].length && <p className="pill goodPill">No errors or warnings.</p>}{aggregate.errors?.map((error, index) => <p className="notice risk" key={`e-${index}`}>{error.wallet || 'Input'}: {error.message}</p>)}{aggregate.warnings?.map((warning, index) => <p className="notice watch" key={`w-${index}`}>{warning.message}</p>)}</div>
        </section>

        <section className="card"><h2>Treasury Signals</h2><div className="alerts">{intelligence.signals?.map((signal, index) => <div className={`alert ${signal.severity}`} key={`${signal.title}-${index}`}><strong>{signal.title}</strong><p>{signal.explanation}</p></div>)}</div></section>
      </>}

      {hasSuccessfulAnalysis && <section className="card intelligence">
        <div className="sectionHead"><div><p className="eyebrow">Treasury Intelligence</p><h2>{intelligence.treasuryHealth?.score}/100 · {intelligence.treasuryHealth?.status}</h2></div><button onClick={() => setBriefVisible(true)}>Generate Executive Brief</button></div>
        <p>{intelligence.treasuryHealth?.explanation}</p>
        <div className="grid three">
          <div><h3>Strengths</h3>{intelligence.treasuryHealth?.strengths?.map((item) => <p className="pill goodPill" key={item}>{item}</p>)}</div>
          <div><h3>Risks</h3>{intelligence.treasuryHealth?.risks?.map((item) => <p className="pill riskPill" key={item}>{item}</p>)}</div>
          <div><h3>Idle Capital Detection</h3><p className="big">{fmtUSD(intelligence.idleCapital?.idleCapitalUSD)}</p><p>{intelligence.idleCapital?.explanation}</p></div>
        </div>
        <h3>Treasury Alerts</h3><div className="alerts">{intelligence.alerts?.map((alert, index) => <div className={`alert ${alert.severity}`} key={`${alert.title}-${index}`}><strong>{alert.title}</strong><p>{alert.explanation}</p><small>{alert.suggestedAction}</small></div>)}</div>
        <h3>Rule-Based Benchmarking</h3><div className="benchmarks">{intelligence.benchmarks?.map((bench) => <div key={bench.category}><strong>{bench.category}</strong><span>{bench.score}/100 · {bench.label}</span><p>{bench.explanation}</p></div>)}</div>
        <div className="grid two"><div className="subcard"><h3>Changes Since Previous Snapshot</h3><input type="file" accept="application/json" onChange={uploadSnapshot} />{snapshotError && <p className="notice risk">{snapshotError}</p>}<ChangeBox change={intelligence.changeDetection} /></div><div className="subcard"><h3>Snapshot Export</h3><p>Snapshot includes timestamp, wallet input, contract input, aggregate data, pricing, signals, intelligence, alerts, and executive brief if generated.</p><button onClick={() => exportJson('snapshot')}>Download Treasury Snapshot</button><button className="secondary" onClick={() => exportJson('export')}>Export JSON</button></div></div>
        <div className="subcard"><h3>Treasury Simulation</h3><div className="simGrid">{Object.keys(simulation).filter((key) => key.endsWith('Pct')).map((key) => <label key={key}>{key.replace(/([A-Z])/g, ' $1')}<input type="number" value={simulation[key]} onChange={(event) => setSimulation({ ...simulation, [key]: Number(event.target.value) })} /></label>)}</div>{simulated && <p className="big">Estimated new treasury value: {fmtUSD(simulated.estimatedTreasuryValueUSD)} ({fmtUSD(simulated.estimatedGainLossUSD)})</p>}<p className="muted">Simulation is an estimate based on current visible balances and prices. It is not financial advice.</p></div>
        {briefVisible && <div className="subcard"><h3>Executive Treasury Brief</h3><pre>{intelligence.executiveBrief}</pre><button onClick={() => { navigator.clipboard?.writeText(intelligence.executiveBrief); setCopyNotice('Brief copied ✓'); }}>Copy brief</button><button className="secondary" onClick={() => download('wealthview-executive-brief.txt', intelligence.executiveBrief, 'text/plain')}>Download .txt</button>{copyNotice && <span className="ok">{copyNotice}</span>}</div>}
        <DeveloperApiCard />
      </section>}
    </main>
  );
}

function Metric({ title, value, note }) { return <div className="card metric"><span>{title}</span><strong>{value}</strong><small>{note}</small></div>; }
function DeveloperApiCard() { return <div className="card"><h2>Developer / Agent API</h2>{['/api/aggregate?wallets=G...', '/api/signals?wallets=G...', '/api/intelligence?wallets=G...'].map((endpoint) => <div className="apiRow" key={endpoint}><code>{endpoint}</code><button className="tiny" onClick={() => navigator.clipboard?.writeText(endpoint)}>Copy</button></div>)}<p className="muted">Agent files are available at <code>/agent.json</code>, <code>/openapi.json</code>, and <code>/mcp.json</code>.</p></div>; }
function ChangeBox({ change }) {
  if (!change?.available) return <p className="muted">Upload a previous snapshot to detect treasury changes.</p>;
  return <div><p>Total USD change: <strong>{fmtUSD(change.totalUSDChange)}</strong> ({fmtPct(change.totalUSDChangePct)})</p><p>Total XLM change: <strong>{numberFmt.format(change.totalXLMChange)}</strong></p><p>New assets: {change.newAssets?.join(', ') || 'None'}</p><p>Removed assets: {change.removedAssets?.join(', ') || 'None'}</p><p>Pricing coverage change: {fmtPct(change.pricingCoverageChange)}</p><p>Concentration change: {fmtPct(change.concentrationChangePct)}</p></div>;
}
