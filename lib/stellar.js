const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org';
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-rpc.mainnet.stellar.gateway.fm';
const ACCOUNT_RE = /^G[A-Z2-7]{55}$/;
const CONTRACT_RE = /^C[A-Z2-7]{55}$/;
const XLM_RESERVE_PER_ENTRY = 0.5;

const FIAT_PEGS = {
  USDC: { priceUsd: 1, source: 'approximate USD peg assumption' },
  USDZ: { priceUsd: 1, source: 'approximate USD peg assumption' },
  EURC: { priceUsd: 1.08, source: 'approximate EUR/USD fiat peg assumption' },
  EURX: { priceUsd: 1.08, source: 'approximate EUR/USD fiat peg assumption' },
  GBPX: { priceUsd: 1.27, source: 'approximate GBP/USD fiat peg assumption' }
};

export function parseDelimitedInput(value = '') {
  return String(value)
    .split(/[\n,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);
}

export const parseWallets = parseDelimitedInput;
export const parseContracts = parseDelimitedInput;
export function isValidStellarPublicKey(wallet) { return ACCOUNT_RE.test(String(wallet || '').trim()); }
export function isValidContractId(contractId) { return CONTRACT_RE.test(String(contractId || '').trim()); }

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { accept: 'application/json', ...(options.headers || {}) } });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  return response.json();
}

async function fetchMarketPrices(warnings) {
  const prices = {
    XLM: { priceUsd: null, source: 'unavailable' },
    AQUA: { priceUsd: null, source: 'unavailable' }
  };

  try {
    const data = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=stellar,aquarius&vs_currencies=usd', {
      next: { revalidate: 60 }
    });
    const xlm = Number(data?.stellar?.usd);
    const aqua = Number(data?.aquarius?.usd);
    if (Number.isFinite(xlm) && xlm > 0) prices.XLM = { priceUsd: xlm, source: 'CoinGecko stellar spot price' };
    if (Number.isFinite(aqua) && aqua > 0) prices.AQUA = { priceUsd: aqua, source: 'CoinGecko aquarius spot price' };
  } catch (error) {
    warnings.push({ type: 'pricing', message: `Market pricing provider unavailable: ${error.message}` });
  }

  return { ...prices, ...FIAT_PEGS };
}

function priceForBalance(balance, priceBook) {
  const code = balance.asset_type === 'native' ? 'XLM' : String(balance.asset_code || '').toUpperCase();
  return priceBook[code] || { priceUsd: null, source: 'unpriced asset' };
}

function assetKeyForBalance(balance) {
  if (balance.asset_type === 'native') return 'native:XLM';
  return `classic:${balance.asset_code}:${balance.asset_issuer}`;
}

function normalizeBalance(balance, wallet, priceBook) {
  const native = balance.asset_type === 'native';
  const code = native ? 'XLM' : balance.asset_code;
  const issuer = native ? null : balance.asset_issuer;
  const amount = Number(balance.balance || 0);
  const pricing = priceForBalance(balance, priceBook);
  const priced = Number.isFinite(pricing.priceUsd) && pricing.priceUsd >= 0;
  const valueUsd = priced ? amount * pricing.priceUsd : null;
  return {
    key: assetKeyForBalance(balance),
    wallet,
    type: native ? 'native' : 'classic',
    code,
    issuer,
    assetType: balance.asset_type,
    balance: Number(amount.toFixed(7)),
    limit: balance.limit ? Number(balance.limit) : null,
    priceUsd: priced ? pricing.priceUsd : null,
    priceSource: pricing.source,
    valueUsd: priced ? Number(valueUsd.toFixed(2)) : null,
    priced
  };
}

function summarizeAccount(wallet, account) {
  const native = account.balances?.find((balance) => balance.asset_type === 'native');
  const xlm = Number(native?.balance || 0);
  const subentryCount = Number(account.subentry_count || 0);
  const sponsorCount = Number(account.num_sponsored || 0);
  const sponsoringCount = Number(account.num_sponsoring || 0);
  const minimumXlmReserve = Math.max((2 + subentryCount + sponsoringCount - sponsorCount) * XLM_RESERVE_PER_ENTRY, 1);
  return {
    wallet,
    sequence: account.sequence,
    lastModifiedLedger: account.last_modified_ledger,
    subentryCount,
    totalXLM: Number(xlm.toFixed(7)),
    minimumXlmReserve: Number(minimumXlmReserve.toFixed(7)),
    spendableXLM: Number(Math.max(xlm - minimumXlmReserve, 0).toFixed(7)),
    assetCount: account.balances?.length || 0
  };
}

function mergeAssets(holdings) {
  const byKey = new Map();
  for (const holding of holdings) {
    const existing = byKey.get(holding.key) || {
      key: holding.key,
      type: holding.type,
      code: holding.code,
      issuer: holding.issuer || null,
      contractId: holding.contractId || null,
      balance: 0,
      priceUsd: holding.priceUsd,
      priceSource: holding.priceSource,
      valueUsd: 0,
      priced: holding.priced,
      wallets: []
    };
    existing.balance += Number(holding.balance || 0);
    if (holding.priced && Number.isFinite(holding.valueUsd)) existing.valueUsd += holding.valueUsd;
    if (!holding.priced) existing.priced = false;
    if (!existing.wallets.includes(holding.wallet)) existing.wallets.push(holding.wallet);
    byKey.set(holding.key, existing);
  }

  return [...byKey.values()].map((asset) => ({
    ...asset,
    balance: Number(asset.balance.toFixed(7)),
    valueUsd: asset.priced ? Number(asset.valueUsd.toFixed(2)) : null,
    allocationPct: 0
  })).sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
}

async function querySorobanContracts(contractIds, warnings) {
  const validContracts = [];
  const invalidContracts = [];
  for (const contractId of contractIds) {
    if (isValidContractId(contractId)) validContracts.push(contractId);
    else invalidContracts.push({ contractId, message: 'Invalid SEP-41/Soroban contract ID. Expected a C... contract address.' });
  }
  warnings.push(...invalidContracts.map((item) => ({ type: 'soroban', ...item })));

  if (!validContracts.length) return [];

  const contracts = [];
  for (const contractId of validContracts) {
    try {
      await fetchJson(SOROBAN_RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: contractId, method: 'getLatestLedger' })
      });
      contracts.push({ contractId, status: 'reachable', message: 'Soroban RPC reachable. Holder-specific SEP-41 balances require contract balance keys, so no synthetic token balance was added.' });
      warnings.push({ type: 'soroban', contractId, message: 'Soroban contract accepted, but no SEP-41 balance was added without a verifiable holder balance key.' });
    } catch (error) {
      contracts.push({ contractId, status: 'warning', message: `Soroban RPC query failed: ${error.message}` });
      warnings.push({ type: 'soroban', contractId, message: `Soroban RPC query failed non-fatally: ${error.message}` });
    }
  }
  return contracts;
}

export async function aggregateWallets(walletInput = '', options = {}) {
  const timestamp = new Date().toISOString();
  const requestedWallets = parseWallets(walletInput);
  const requestedContracts = parseContracts(options.contracts || options.sep41 || '');
  const warnings = [];
  const errors = [];

  if (!requestedWallets.length) {
    return {
      success: false,
      timestamp,
      walletCount: 0,
      successfulWalletCount: 0,
      totalXLM: 0,
      totalUSD: 0,
      pricedAssets: [],
      unpricedAssets: [],
      assets: [],
      wallets: [],
      errors: [{ wallet: null, message: 'Enter at least one Stellar public wallet address.' }],
      warnings,
      pricing: {},
      soroban: []
    };
  }

  const validWallets = [];
  for (const wallet of requestedWallets) {
    if (isValidStellarPublicKey(wallet)) validWallets.push(wallet);
    else errors.push({ wallet, message: 'Invalid Stellar public key. Expected a G... public account address.' });
  }

  const priceBook = await fetchMarketPrices(warnings);
  const accountResults = await Promise.allSettled(validWallets.map(async (wallet) => {
    const account = await fetchJson(`${HORIZON_URL}/accounts/${encodeURIComponent(wallet)}`, { next: { revalidate: 20 } });
    return { wallet, account };
  }));

  const holdings = [];
  const wallets = [];
  for (const result of accountResults) {
    if (result.status === 'rejected') {
      const index = accountResults.indexOf(result);
      errors.push({ wallet: validWallets[index], message: `Horizon account query failed: ${result.reason?.message || 'Unknown Horizon error'}` });
      continue;
    }
    const { wallet, account } = result.value;
    wallets.push(summarizeAccount(wallet, account));
    for (const balance of account.balances || []) holdings.push(normalizeBalance(balance, wallet, priceBook));
  }

  const soroban = await querySorobanContracts(requestedContracts, warnings);
  const assets = mergeAssets(holdings);
  const totalUSD = Number(assets.reduce((sum, asset) => sum + (Number.isFinite(asset.valueUsd) ? asset.valueUsd : 0), 0).toFixed(2));
  const totalXLM = Number(assets.filter((asset) => asset.type === 'native' && asset.code === 'XLM').reduce((sum, asset) => sum + asset.balance, 0).toFixed(7));
  for (const asset of assets) asset.allocationPct = totalUSD > 0 && Number.isFinite(asset.valueUsd) ? Number(((asset.valueUsd / totalUSD) * 100).toFixed(2)) : 0;

  const pricedAssets = assets.filter((asset) => asset.priced);
  const unpricedAssets = assets.filter((asset) => !asset.priced);
  const pricingCoveragePct = assets.length ? Number(((pricedAssets.length / assets.length) * 100).toFixed(2)) : 0;

  return {
    success: validWallets.length > 0 && wallets.length > 0,
    timestamp,
    walletCount: requestedWallets.length,
    validWalletCount: validWallets.length,
    successfulWalletCount: wallets.length,
    totalXLM,
    totalUSD,
    pricedAssets,
    unpricedAssets,
    assets,
    wallets,
    errors,
    warnings,
    pricing: priceBook,
    pricingCoveragePct,
    soroban
  };
}
