import { NextResponse } from 'next/server';
import { aggregateWallets } from '../../../lib/stellar.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallets = searchParams.get('wallets') || '';
  const contracts = searchParams.get('contracts') || searchParams.get('sep41') || '';
  const aggregate = await aggregateWallets(wallets, { contracts });
  return NextResponse.json(aggregate, { status: aggregate.success ? 200 : 400 });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const aggregate = await aggregateWallets(body.wallets || '', { contracts: body.contracts || body.sep41 || '' });
  return NextResponse.json(aggregate, { status: aggregate.success ? 200 : 400 });
}
