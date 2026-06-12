import { aggregateWallets } from '../lib/stellar.js';
import { intelligenceSummary, signalSet } from '../lib/intelligence.js';
import { parseSep41Holdings } from '../lib/sep41.js';
import { handleOptions, readQueryValue, sendJson } from './_treasurySignals.js';

export default async function handler(request, response) {
  if (handleOptions(request, response)) return;
  try {
    const wallets = readQueryValue(request, 'wallets', readQueryValue(request, 'wallet', ''));
    const sep41Holdings = parseSep41Holdings(readQueryValue(request, 'sep41', ''));
    const previousSnapshot = readQueryValue(request, 'previous', '');
    const aggregate = await aggregateWallets(wallets, { sep41Holdings });
    const previous = previousSnapshot ? JSON.parse(Buffer.from(previousSnapshot, 'base64url').toString('utf8')) : null;
    const intelligence = intelligenceSummary(aggregate, { previousSnapshot: previous });
    sendJson(response, { data: { aggregate, signals: signalSet(aggregate), intelligence } });
  } catch (error) {
    sendJson(response, { error: error.message }, 400);
  }
}
