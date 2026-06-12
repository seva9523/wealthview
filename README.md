# WealthView

WealthView is a Stellar-native treasury dashboard that keeps the original wallet-first workflow intact: paste one or more Stellar wallets, query live balances through `/api/aggregate`, review XLM and classic trustline holdings, optionally include SEP-41/Soroban token holdings from an indexer, then generate share links, snapshots, exports, Treasury Signals, and additive Treasury Intelligence.

## Features

- Multiple Stellar wallet aggregation from live Horizon account data.
- XLM balance and reserve-aware idle-capital calculations.
- Stellar classic asset/trustline detection and stable asset pricing rules.
- Optional SEP-41/Soroban token holdings via `CODE:CONTRACT_ID:BALANCE:PRICE_USD` input.
- Current XLM pricing from CoinGecko with graceful fallback when pricing is unavailable.
- Treasury Signals UI, shareable URL state, JSON export, and downloadable treasury snapshots.
- Additive Treasury Intelligence modules: Health Score, Idle Capital Detection, Alerts, Rule-based Benchmarking, Snapshot Change Detection, Simulation, and Executive Brief.

## Local checks

```bash
npm run check
```

## Static build

```bash
npm run build
```

The build command writes the static website to both `public/` and `dist/`. Vercel serves `public/`; GitHub Pages deploys `dist/`.

## Deploy

### GitHub Pages

1. Merge this branch into `main`.
2. In GitHub, go to **Settings → Pages** and select **GitHub Actions** as the source.
3. Run the **Deploy WealthView Pages** workflow or push to `main`.

### Vercel

1. Import the repository into Vercel.
2. Use the default framework preset (`Other`).
3. Confirm Vercel uses `npm run build` and output directory `public`.
4. Deploy. Vercel exposes the serverless routes in `api/`.
