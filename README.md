# WealthView.pro

WealthView.pro is a read-only Stellar Treasury Intelligence platform for builders, startups, DAOs, and AI agents. It is not a generic wealth dashboard and it does not connect wallets, sign transactions, trade, custody assets, authenticate users, or store a database.

## What it does

- Accepts one or more Stellar `G...` public wallet addresses.
- Queries Stellar Horizon for native XLM balances and classic trustline assets.
- Aggregates balances across wallets while keeping per-wallet errors non-fatal.
- Estimates USD value only where pricing is available or where an explicit stable/fiat peg assumption is labeled.
- Marks unknown assets as unpriced instead of silently faking a value.
- Accepts optional SEP-41/Soroban `C...` contract IDs and reports non-fatal Soroban warnings when a read-only contract check cannot produce a verifiable holder balance.
- Produces Treasury Health Score, Idle Capital Detection, Treasury Alerts, Rule-Based Benchmarking, Snapshot Change Detection, Treasury Simulation, and an Executive Treasury Brief from the live aggregate result.
- Provides `/api/aggregate`, `/api/signals`, and `/api/intelligence` for developers and agents.
- Includes `public/index.html`, `public/styles.css`, and `public/wealthview-static.js` as a static Vercel fallback for projects that still have an old `public` output-directory override.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production deployment on Vercel

This is a production-ready Next.js app. Vercel should auto-detect Next.js. Use:

- Install command: `npm install`
- Build command: `npm run build`
- Output directory: leave blank / Next.js default

If a previous deployment still has a Vercel Output Directory override set to `public`, either clear that setting and redeploy or rely on the included static fallback, which renders the same wallet-first read-only experience and calls the same API endpoints.

Optional environment variables:

- `STELLAR_HORIZON_URL` — defaults to `https://horizon.stellar.org`
- `SOROBAN_RPC_URL` — defaults to a public mainnet Soroban RPC endpoint

## API examples

```bash
curl 'https://wealthview.pro/api/aggregate?wallets=G...'
curl 'https://wealthview.pro/api/signals?wallets=G...'
curl 'https://wealthview.pro/api/intelligence?wallets=G...'
```

## Pricing policy

XLM and AQUA use market pricing where available. USDC, USDZ, EURC, EURx, and GBPx use explicit approximate fiat peg assumptions with clear labels. Unknown assets remain unpriced and are excluded from USD totals.
