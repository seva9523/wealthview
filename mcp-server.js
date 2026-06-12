import { createInterface } from 'node:readline';
import { aggregateWallets } from './lib/stellar.js';
import { intelligenceSummary, signalSet } from './lib/intelligence.js';
import { parseSep41Holdings } from './lib/sep41.js';

const walletInputSchema = {
  type: 'object',
  properties: {
    wallets: { type: 'string', description: 'Comma, space, or newline separated Stellar G... wallet public keys.' },
    sep41: { type: 'string', description: 'Optional SEP-41 holdings as CODE:CONTRACT_ID:BALANCE:PRICE_USD entries separated by semicolons.' }
  },
  required: ['wallets']
};

const tools = [
  { name: 'wealthview_aggregate', description: 'Query live Stellar wallets and return the WealthView aggregate.', inputSchema: walletInputSchema },
  { name: 'wealthview_intelligence', description: 'Return Treasury Intelligence calculated from live Stellar wallet aggregation.', inputSchema: walletInputSchema },
  { name: 'wealthview_signals', description: 'Return Treasury Signals calculated from live Stellar wallet aggregation.', inputSchema: walletInputSchema }
];

async function aggregateFromArgs(args = {}) {
  return aggregateWallets(args.wallets ?? '', { sep41Holdings: parseSep41Holdings(args.sep41 ?? '') });
}

async function resultFor(name, args) {
  const aggregate = await aggregateFromArgs(args);
  if (name === 'wealthview_aggregate') return aggregate;
  if (name === 'wealthview_intelligence') return intelligenceSummary(aggregate);
  if (name === 'wealthview_signals') return signalSet(aggregate);
  throw new Error(`Unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);
  const { id, method, params = {} } = request;
  try {
    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'wealthview', version: '1.0.0' } } });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools } });
    } else if (method === 'tools/call') {
      const data = await resultFor(params.name, params.arguments ?? {});
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } });
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (error) {
    send({ jsonrpc: '2.0', id, error: { code: -32000, message: error.message } });
  }
});
