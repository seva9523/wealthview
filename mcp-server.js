import { createInterface } from 'node:readline';
import { latestSnapshot, getHistory } from './lib/history.js';
import { intelligenceSummary, signalSet } from './lib/intelligence.js';

const tools = [
  { name: 'wealthview_snapshot', description: 'Return the latest WealthView treasury snapshot.' },
  { name: 'wealthview_history', description: 'Return recent WealthView treasury history.' },
  { name: 'wealthview_intelligence', description: 'Return WealthView risk intelligence.' },
  { name: 'wealthview_signals', description: 'Return WealthView treasury monitoring signals.' }
];

function resultFor(name) {
  if (name === 'wealthview_snapshot') return latestSnapshot();
  if (name === 'wealthview_history') return getHistory(7);
  if (name === 'wealthview_intelligence') return intelligenceSummary();
  if (name === 'wealthview_signals') return signalSet();
  throw new Error(`Unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);
  const { id, method, params = {} } = request;
  try {
    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'wealthview', version: '1.0.0' } } });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools } });
    } else if (method === 'tools/call') {
      const data = resultFor(params.name);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } });
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (error) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: error.message } });
  }
});
