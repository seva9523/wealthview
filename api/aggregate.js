import { aggregateWallets } from '../lib/stellar.js';
import { handleOptions, readQueryValue, sendJson } from './_treasurySignals.js';

export default async function handler(request, response) {
  if (handleOptions(request, response)) return;
  const wallets = readQueryValue(request, 'wallets', readQueryValue(request, 'wallet', ''));
  const contracts = readQueryValue(request, 'contracts', readQueryValue(request, 'sep41', ''));
  const aggregate = await aggregateWallets(wallets, { contracts });
  sendJson(response, aggregate, aggregate.success ? 200 : 400);
}
