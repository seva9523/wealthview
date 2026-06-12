import { aggregateWallets } from '../lib/stellar.js';
import { parseSep41Holdings } from '../lib/sep41.js';
import { handleOptions, readQueryValue, sendJson } from './_treasurySignals.js';

export default async function handler(request, response) {
  if (handleOptions(request, response)) return;
  const wallets = readQueryValue(request, 'wallets', readQueryValue(request, 'wallet', ''));
  const aggregate = await aggregateWallets(wallets, { sep41Holdings: parseSep41Holdings(readQueryValue(request, 'sep41', '')) });
  sendJson(response, { data: aggregate });
}
