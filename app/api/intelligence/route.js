import { NextResponse } from 'next/server';
import { aggregateWallets } from '../../../lib/stellar.js';
import { buildIntelligence } from '../../../lib/intelligence.js';

export const dynamic = 'force-dynamic';

function parsePrevious(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const aggregate = await aggregateWallets(searchParams.get('wallets') || '', { contracts: searchParams.get('contracts') || searchParams.get('sep41') || '' });
  const previousSnapshot = parsePrevious(searchParams.get('previousSnapshot'));
  const intelligence = buildIntelligence(aggregate, { previousSnapshot });
  return NextResponse.json(intelligence, { status: aggregate.success ? 200 : 400 });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const aggregate = await aggregateWallets(body.wallets || '', { contracts: body.contracts || body.sep41 || '' });
  const intelligence = buildIntelligence(aggregate, { previousSnapshot: body.previousSnapshot || null });
  return NextResponse.json(intelligence, { status: aggregate.success ? 200 : 400 });
}
