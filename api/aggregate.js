import { getHistory, latestSnapshot } from '../lib/history.js';
import { intelligenceSummary, signalSet } from '../lib/intelligence.js';
import { sep41Assets } from '../lib/sep41.js';
import { handleOptions, sendJson } from './_treasurySignals.js';

export default function handler(request, response) {
  if (handleOptions(request, response)) return;
  sendJson(response, {
    data: {
      snapshot: latestSnapshot(),
      history: getHistory(7),
      intelligence: intelligenceSummary(),
      signals: signalSet(),
      assets: sep41Assets
    }
  });
}
