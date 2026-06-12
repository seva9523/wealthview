'use client';

import { useEffect, useMemo, useState } from 'react';

const walletPattern = /^G[A-Z2-7]{55}$/;
const contractPattern = /^C[A-Z2-7]{55}$/;
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 7 });

function splitInput(value) { return String(value || '').split(/[\n,;\s]+/).map((item) => item.trim()).filter(Boolean); }
function fmtUSD(value) { return currency.format(Number(value || 0)); }
function fmtPct(value) { return `${Number(value || 0).toFixed(2)}%`; }
function assetLabel(asset) { return asset.type === 'native' ? 'XLM' : `${asset.code}${asset.issuer ? `:${asset.issuer.slice(0, 5)}…` : ''}`; }
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
  const [shareOk, setShareOk] = useState(false);
  const [previousSnapshot, setPreviousSnapshot] = useState(null);
  const [snapshotError, setSnapshotError] = useState('');
  const [briefVisible, setBriefVisible] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');
  const [simulation, setSimulation] = useState({ xlmPriceChangePct: -10, stablecoinDepegPct: -2, topAssetDeclinePct: -15, reallocationPct: 10 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const w = params.get('wallets') || '';
    const c = params.get('contracts') || params.get('sep41') || '';
    if (w) setWallets(w.replaceAll(',', '\n'));
    if (c) setContracts(c.replaceAll(',', '\n'));
  }, []);

  const validation = useMemo(() => {
    const walletList = splitInput(wallets);
    const contractList = splitInput(contracts);
    const errors = [];
    if (!walletList.length) errors.push('Enter at least one Stellar public wallet address.');
    for (const wallet of walletList) if (!walletPattern.test(wallet)) errors.push(`${wallet} is not a valid Stellar G... public key.`);
    for (const contract of contractList) if (!contractPattern.test(contract)) errors.push(`${contract} is not a valid SEP-41/Soroban C... contract ID.`);
    return { walletList, contractList, errors };
  }, [wallets, contracts]);

  async function runAggregation() {
    setInputErrors(validation.errors);
    setShareOk(false);
    setBriefVisible(false);
    if (validation.errors.some((error) => error.includes('Enter at least'))) return;
    setLoading(true);
    try {
      const response = await fetch('/api/aggregate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallets, contracts })
      });
      const aggregateData = await response.json();
      setAggregate(aggregateData);
      const intelResponse = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallets, contracts, previousSnapshot })
      });
      const intelData = await intelResponse.json();
      setIntelligence(intelData);
      setSimulation(intelData.simulationDefaults || simulation);
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

  const snapshot = useMemo(() => aggregate && intelligence ? {
    product: 'WealthView.pro',
    type: 'stellar-treasury-snapshot',
    timestamp: new Date().toISOString(),
    aggregate,
    intelligence,
    alerts: intelligence.alerts,
    executiveBrief: intelligence.executiveBrief
  } : null, [aggregate, intelligence]);

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
      if (aggregate) {
        const response = await fetch('/api/intelligence', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ wallets, contracts, previousSnapshot: json })
        });
        setIntelligence(await response.json());
      }
    } catch (error) {
      setSnapshotError(`Malformed snapshot upload: ${error.message}`);
    }
  }

  const simulated = useMemo(() => {
    if (!aggregate) return null;
    const nav = aggregate.totalUSD || 0;
    const xlm = aggregate.assets?.find((asset) => asset.code === 'XLM')?.valueUsd || 0;
    const stables = aggregate.assets?.filter((asset) => ['USDC', 'USDZ', 'EURC', 'EURX', 'GBPX'].includes(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + (asset.valueUsd || 0), 0) || 0;
    const top = [...(aggregate.assets || [])].filter((asset) => Number.isFinite(asset.valueUsd)).sort((a, b) => b.valueUsd - a.valueUsd)[0];
    const volatile = aggregate.assets?.filter((asset) => ['XLM', 'AQUA'].includes(String(asset.code).toUpperCase())).reduce((sum, asset) => sum + (asset.valueUsd || 0), 0) || 0;
    const nextValue = nav + xlm * (simulation.xlmPriceChangePct / 100) + stables * (simulation.stablecoinDepegPct / 100) + (top?.valueUsd || 0) * (simulation.topAssetDeclinePct / 100) + volatile * (simulation.reallocationPct / 100) * 0.02;
    return { estimatedTreasuryValueUSD: nextValue, estimatedGainLossUSD: nextValue - nav, affectedAssets: ['XLM', 'Stablecoins', top?.code].filter(Boolean) };
  }, [aggregate, simulation]);

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Read-only Stellar treasury intelligence</div>
        <h1>WealthView.pro for Stellar builders, startups, DAOs, and AI agents.</h1>
        <p>Enter one or more public Stellar wallets to aggregate XLM, classic trustline assets, optional SEP-41 contract checks, pricing coverage, alerts, snapshots, simulations, and board-ready treasury intelligence. No wallet connection, signing, transactions, custody, login, or database.</p>
        <div className="heroBadges"><span>Horizon-backed</span><span>Read-only</span><span>Agent-ready APIs</span></div>
      </section>

      <section className="grid two">
        <div className="card inputCard">
          <h2>Wallet Input</h2>
          <label>Stellar public wallets</label>
          <textarea value={wallets} onChange={(e) => setWallets(e.target.value)} placeholder="G...\nG... or comma-separated" rows={6} />
          <label>Optional SEP-41 / Soroban contract IDs</label>
          <textarea value={contracts} onChange={(e) => setContracts(e.target.value)} placeholder="C... optional, comma-separated or line-separated" rows={3} />
          <div className="actions">
            <button onClick={runAggregation} disabled={loading}>{loading ? 'Aggregating…' : 'Run Read-Only Aggregation'}</button>
            <button className="secondary" onClick={generateShareLink}>Generate Share Link {shareOk ? '✓' : ''}</button>
          </div>
          <p className="muted">Supports comma-separated and line-separated inputs. Invalid wallets are shown clearly; valid wallets can still aggregate if Horizon responds.</p>
          {!!inputErrors.length && <div className="notice risk">{inputErrors.map((error) => <p key={error}>{error}</p>)}</div>}
        </div>

        <div className="card">
          <h2>Developer API</h2>
          {['/api/aggregate?wallets=G...', '/api/signals?wallets=G...', '/api/intelligence?wallets=G...'].map((endpoint) => (
            <div className="apiRow" key={endpoint}><code>{endpoint}</code><button className="tiny" onClick={() => navigator.clipboard?.writeText(endpoint)}>Copy</button></div>
          ))}
          <p className="muted">Agent files are available at <code>/agent.json</code>, <code>/openapi.json</code>, and <code>/mcp.json</code>.</p>
        </div>
      </section>

      {aggregate && <>
        <section className="grid four overview">
          <Metric title="Priced Treasury Value" value={fmtUSD(aggregate.totalUSD)} note="Unpriced assets excluded" />
          <Metric title="Total XLM" value={numberFmt.format(aggregate.totalXLM)} note="Native balances aggregated" />
          <Metric title="Wallets Queried" value={`${aggregate.successfulWalletCount}/${aggregate.walletCount}`} note="Per-wallet errors shown below" />
          <Metric title="Pricing Coverage" value={fmtPct(aggregate.pricingCoveragePct)} note={`${aggregate.unpricedAssets?.length || 0} unpriced asset types`} />
        </section>

        <section className="grid two">
          <div className="card">
            <h2>Asset Allocation</h2>
            <div className="assetList">{aggregate.assets?.map((asset) => <div className="asset" key={asset.key}><div><strong>{assetLabel(asset)}</strong><span>{asset.type}{asset.priceSource ? ` · ${asset.priceSource}` : ''}</span></div><div><strong>{asset.priced ? fmtUSD(asset.valueUsd) : 'Unpriced'}</strong><span>{numberFmt.format(asset.balance)} · {fmtPct(asset.allocationPct)}</span></div></div>)}</div>
          </div>
          <div className="card">
            <h2>Wallet Summary</h2>
            {aggregate.wallets?.map((wallet) => <div className="walletRow" key={wallet.wallet}><code>{wallet.wallet.slice(0, 8)}…{wallet.wallet.slice(-6)}</code><span>{numberFmt.format(wallet.totalXLM)} XLM</span><span>{wallet.assetCount} assets</span></div>)}
          </div>
        </section>

        <section className="grid two">
          <div className="card">
            <h2>Pricing Coverage & Unpriced Assets</h2>
            <p className="muted">Stablecoins use explicit approximate fiat peg labels. Unknown assets are never silently priced.</p>
            {aggregate.unpricedAssets?.length ? aggregate.unpricedAssets.map((asset) => <p key={asset.key} className="pill riskPill">{asset.code} is unpriced and excluded from USD totals.</p>) : <p className="pill goodPill">All visible asset types have pricing labels.</p>}
          </div>
          <div className="card">
            <h2>Errors / Warnings</h2>
            {![...(aggregate.errors || []), ...(aggregate.warnings || [])].length && <p className="pill goodPill">No errors or warnings.</p>}
            {aggregate.errors?.map((error, i) => <p className="notice risk" key={`e-${i}`}>{error.wallet || 'Input'}: {error.message}</p>)}
            {aggregate.warnings?.map((warning, i) => <p className="notice watch" key={`w-${i}`}>{warning.message}</p>)}
          </div>
        </section>
      </>}

      {intelligence && <section className="card intelligence">
        <div className="sectionHead"><div><p className="eyebrow">Treasury Intelligence</p><h2>{intelligence.treasuryHealth?.score}/100 · {intelligence.treasuryHealth?.status}</h2></div><button onClick={() => setBriefVisible(true)}>Generate Executive Brief</button></div>
        <p>{intelligence.treasuryHealth?.explanation}</p>
        <div className="grid three">
          <div><h3>Strengths</h3>{intelligence.treasuryHealth?.strengths?.map((item) => <p className="pill goodPill" key={item}>{item}</p>)}</div>
          <div><h3>Risks</h3>{intelligence.treasuryHealth?.risks?.map((item) => <p className="pill riskPill" key={item}>{item}</p>)}</div>
          <div><h3>Idle Capital Detection</h3><p className="big">{fmtUSD(intelligence.idleCapital?.idleCapitalUSD)}</p><p>{intelligence.idleCapital?.explanation}</p></div>
        </div>

        <h3>Treasury Alerts</h3>
        <div className="alerts">{intelligence.alerts?.map((alert, i) => <div className={`alert ${alert.severity}`} key={`${alert.title}-${i}`}><strong>{alert.title}</strong><p>{alert.explanation}</p><small>{alert.suggestedAction}</small></div>)}</div>

        <h3>Rule-Based Benchmarking</h3>
        <div className="benchmarks">{intelligence.benchmarks?.map((bench) => <div key={bench.category}><strong>{bench.category}</strong><span>{bench.score}/100 · {bench.label}</span><p>{bench.explanation}</p></div>)}</div>

        <div className="grid two">
          <div className="subcard"><h3>Changes Since Previous Snapshot</h3><input type="file" accept="application/json" onChange={uploadSnapshot} />{snapshotError && <p className="notice risk">{snapshotError}</p>}<ChangeBox change={intelligence.changeDetection} /></div>
          <div className="subcard"><h3>Snapshot Export</h3><p>Timestamped snapshot includes aggregate data, intelligence, alerts, and executive brief.</p><button onClick={() => exportJson('snapshot')}>Download Treasury Snapshot</button><button className="secondary" onClick={() => exportJson('export')}>Export JSON</button></div>
        </div>

        <div className="subcard"><h3>Treasury Simulation</h3><div className="simGrid">{Object.keys(simulation).filter((key) => key.endsWith('Pct')).map((key) => <label key={key}>{key.replace(/([A-Z])/g, ' $1')}<input type="number" value={simulation[key]} onChange={(e) => setSimulation({ ...simulation, [key]: Number(e.target.value) })} /></label>)}</div>{simulated && <p className="big">Estimated value: {fmtUSD(simulated.estimatedTreasuryValueUSD)} ({fmtUSD(simulated.estimatedGainLossUSD)})</p>}<p className="muted">Simulation is an estimate based on current visible balances and prices. It is not financial advice.</p></div>

        {briefVisible && <div className="subcard"><h3>Executive Treasury Brief</h3><pre>{intelligence.executiveBrief}</pre><button onClick={() => { navigator.clipboard?.writeText(intelligence.executiveBrief); setCopyNotice('Brief copied ✓'); }}>Copy brief</button><button className="secondary" onClick={() => download('wealthview-executive-brief.txt', intelligence.executiveBrief, 'text/plain')}>Download .txt</button>{copyNotice && <span className="ok">{copyNotice}</span>}</div>}
      </section>}
    </main>
  );
}

function Metric({ title, value, note }) { return <div className="card metric"><span>{title}</span><strong>{value}</strong><small>{note}</small></div>; }
function ChangeBox({ change }) {
  if (!change?.available) return <p className="muted">Upload a previous snapshot to detect treasury changes.</p>;
  return <div><p>Total USD change: <strong>{fmtUSD(change.totalUSDChange)}</strong> ({fmtPct(change.totalUSDChangePct)})</p><p>Total XLM change: <strong>{numberFmt.format(change.totalXLMChange)}</strong></p><p>New assets: {change.newAssets?.join(', ') || 'None'}</p><p>Removed assets: {change.removedAssets?.join(', ') || 'None'}</p><p>Pricing coverage change: {fmtPct(change.pricingCoverageChange)}</p><p>Concentration change: {fmtPct(change.concentrationChangePct)}</p></div>;
}
