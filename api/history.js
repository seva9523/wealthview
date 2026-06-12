import { getHistory } from '../lib/history.js';
import { handleOptions, sendJson } from './_treasurySignals.js';

export default function handler(request, response) {
  if (handleOptions(request, response)) return;
  const limit = request.query?.limit ?? 30;
  sendJson(response, { data: getHistory(limit) });
}
