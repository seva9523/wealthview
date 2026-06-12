import { handleOptions, sendJson } from './_treasurySignals.js';

export default function handler(request, response) {
  if (handleOptions(request, response)) return;
  sendJson(response, { data: [] });
}
