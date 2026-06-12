#!/usr/bin/env node
import { aggregateWallets } from './lib/stellar.js';
import { buildIntelligence, buildSignals } from './lib/intelligence.js';

async function main() {
  const [tool = 'help', wallets = '', contracts = ''] = process.argv.slice(2);
  if (tool === 'help' || !wallets) {
    console.log(JSON.stringify({ name: 'wealthview-pro', usage: 'node mcp-server.js <aggregate|signals|intelligence> <wallets> [contracts]', readOnly: true }, null, 2));
    return;
  }
  const aggregate = await aggregateWallets(wallets, { contracts });
  if (tool === 'aggregate') console.log(JSON.stringify(aggregate, null, 2));
  else if (tool === 'signals') console.log(JSON.stringify({ success: aggregate.success, signals: buildSignals(aggregate) }, null, 2));
  else if (tool === 'intelligence') console.log(JSON.stringify(buildIntelligence(aggregate), null, 2));
  else console.log(JSON.stringify({ error: `Unknown tool: ${tool}` }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
