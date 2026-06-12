import { NextResponse } from 'next/server';
import { aggregateWallets } from '../../../lib/stellar.js';
import { buildSignals } from '../../../lib/intelligence.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const aggregate = await aggregateWallets(searchParams.get('wallets') || '', { contracts: searchParams.get('contracts') || searchParams.get('sep41') || '' });
  return NextResponse.json({ success: aggregate.success, timestamp: aggregate.timestamp, signals: buildSignals(aggregate), errors: aggregate.errors, warnings: aggregate.warnings }, { status: aggregate.success ? 200 : 400 });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const aggregate = await aggregateWallets(body.wallets || '', { contracts: body.contracts || body.sep41 || '' });
  return NextResponse.json({ success: aggregate.success, timestamp: aggregate.timestamp, signals: buildSignals(aggregate), errors: aggregate.errors, warnings: aggregate.warnings }, { status: aggregate.success ? 200 : 400 });
}
