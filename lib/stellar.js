const HORIZON_URL = 'https://horizon.stellar.org';
const XLM_RESERVE_PER_ENTRY = 0.5;

const STABLE_ASSET_CODES = new Set(['USDC', 'USDT', 'USD', 'EURC', 'EURT', 'DAI', 'GYEN', 'BRL', 'ARS', 'NGNT']);

export function parseWallets(value = '') {
  return String(value)
    .split(/[\s,;]+/)
    .map((wallet) => wallet.trim())
    .filter(Boolean)
    .filter((wallet, index, wallets) => wallets.indexOf(wallet) === index);
}

export function isLikelyStellarAccount(wallet) {
  return /^G[A-Z2-7]{55}$/.test(wallet);
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  return response.json();
}

export async function fetchXlmPrice() {
  try {
    const data = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd');
    const price = Number(data?.stellar?.usd);
    if (Number.isFinite(price) && price > 0) {
      return { XLM: price };
    }
  } catch (error) {
    // Keep aggregation available if the pricing provider is rate limited or unreachable.
  }
  return { XLM: null };
}

export function priceClassicAsset(balance, priceBook) {
  if (balance.asset_type === 'native') {
    return priceBook.XLM;
  }
  const code = balance.asset_code?.toUpperCase();
  if (STABLE_ASSET_CODES.has(code)) return code?.startsWith('EUR') ? 1.08 : 1;
  return null;
}

export async function fetchAccount(wallet) {
  if (!isLikelyStellarAccount(wallet)) {
    throw new Error('Invalid Stellar public key. Expected a G... account id.');
  }
  return fetchJson(`${HORIZON_URL}/accounts/${encodeURIComponent(wallet)}`);
}

export function normalizeBalance(balance, wallet, priceBook) {
  const isNative = balance.asset_type === 'native';
  const code = isNative ? 'XLM' : balance.asset_code;
  const issuer = isNative ? null : balance.asset_issuer;
  const amount = Number(balance.balance ?? 0);
  const priceUsd = priceClassicAsset(balance, priceBook);
  const valueUsd = Number.isFinite(priceUsd) ? amount * priceUsd : null;

  return {
    wallet,
    type: isNative ? 'native' : 'classic',
    code,
    issuer,
    assetType: balance.asset_type,
    balance: amount,
    limit: balance.limit ? Number(balance.limit) : null,
    buyingLiabilities: Number(balance.buying_liabilities ?? 0),
    sellingLiabilities: Number(balance.selling_liabilities ?? 0),
    priceUsd,
    valueUsd,
    priced: Number.isFinite(valueUsd)
  };
}

export function mergeHoldings(holdings) {
  const byAsset = new Map();
  for (const holding of holdings) {
    const key = holding.type === 'native' ? 'native:XLM' : `${holding.type}:${holding.code}:${holding.issuer ?? holding.contract ?? ''}`;
    const existing = byAsset.get(key) ?? {
      type: holding.type,
      code: holding.code,
      issuer: holding.issuer ?? null,
      contract: holding.contract ?? null,
      balance: 0,
      valueUsd: 0,
      priced: true,
      wallets: []
    };
    existing.balance += Number(holding.balance ?? 0);
    existing.wallets.push(holding.wallet);
    if (Number.isFinite(holding.valueUsd)) {
      existing.valueUsd += holding.valueUsd;
    } else {
      existing.priced = false;
    }
    byAsset.set(key, existing);
  }

  return [...byAsset.values()]
    .map((asset) => ({
      ...asset,
      balance: Number(asset.balance.toFixed(7)),
      valueUsd: asset.priced ? Number(asset.valueUsd.toFixed(2)) : null
    }))
    .sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
}

export function summarizeAccounts(accounts) {
  return accounts.map(({ wallet, account }) => {
    const subentryCount = Number(account.subentry_count ?? 0);
    const sponsorCount = Number(account.num_sponsored ?? 0);
    const sponsoringCount = Number(account.num_sponsoring ?? 0);
    const minimumXlmReserve = (2 + subentryCount + sponsoringCount - sponsorCount) * XLM_RESERVE_PER_ENTRY;
    const nativeBalance = Number(account.balances?.find((balance) => balance.asset_type === 'native')?.balance ?? 0);
    return {
      wallet,
      sequence: account.sequence,
      lastModifiedLedger: account.last_modified_ledger,
      subentryCount,
      minimumXlmReserve: Number(Math.max(minimumXlmReserve, 1).toFixed(7)),
      spendableXlm: Number(Math.max(nativeBalance - minimumXlmReserve, 0).toFixed(7))
    };
  });
}

export async function aggregateWallets(wallets, { sep41Holdings = [] } = {}) {
  const uniqueWallets = parseWallets(wallets);
  const asOf = new Date().toISOString();
  const priceBook = await fetchXlmPrice();
  const settled = await Promise.allSettled(uniqueWallets.map(async (wallet) => ({ wallet, account: await fetchAccount(wallet) })));
  const accounts = settled.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const errors = settled
    .map((result, index) => result.status === 'rejected' ? { wallet: uniqueWallets[index], message: result.reason.message } : null)
    .filter(Boolean);

  const classicHoldings = accounts.flatMap(({ wallet, account }) => account.balances.map((balance) => normalizeBalance(balance, wallet, priceBook)));
  const allHoldings = [...classicHoldings, ...sep41Holdings];
  const assets = mergeHoldings(allHoldings);
  const totalValueUsd = Number(assets.reduce((sum, asset) => sum + (Number.isFinite(asset.valueUsd) ? asset.valueUsd : 0), 0).toFixed(2));
  const unpricedAssets = assets.filter((asset) => !asset.priced).length;
  const xlm = assets.find((asset) => asset.type === 'native' && asset.code === 'XLM');
  const classicAssets = assets.filter((asset) => asset.type === 'classic');
  const sorobanAssets = assets.filter((asset) => asset.type === 'sep41');

  return {
    asOf,
    network: 'public',
    wallets: uniqueWallets,
    walletCount: uniqueWallets.length,
    successfulWalletCount: accounts.length,
    errors,
    priceBook,
    totals: {
      valueUsd: totalValueUsd,
      pricedValueUsd: totalValueUsd,
      unpricedAssets,
      xlmBalance: xlm?.balance ?? 0,
      xlmValueUsd: xlm?.valueUsd ?? null,
      classicAssetCount: classicAssets.length,
      sep41AssetCount: sorobanAssets.length
    },
    accounts: summarizeAccounts(accounts),
    assets,
    holdings: allHoldings
  };
}
