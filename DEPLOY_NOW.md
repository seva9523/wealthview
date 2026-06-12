# Deploy WealthView Now

This branch restores the live Stellar wallet experience and adds Treasury Intelligence as an additive section. It does not use static demo treasury metrics.

## Vercel

1. Merge the PR.
2. In Vercel, redeploy the merged commit.
3. Confirm build command is `npm run build` and output directory is `public`.
4. Open the deployment URL, paste one or more Stellar `G...` wallets, and click **Refresh aggregate**.

## GitHub Pages

1. Merge the PR.
2. Use **Settings → Pages → GitHub Actions**.
3. Run the **Deploy WealthView Pages** workflow.

## Live API routes

- `/api/aggregate?wallets=G...` — live wallet aggregate with signals and intelligence.
- `/api/signals?wallets=G...` — Treasury Signals from the aggregate.
- `/api/intelligence?wallets=G...` — Treasury Intelligence from the aggregate.
- `/agent.json`, `/openapi.json`, `/mcp.json`, and `mcp-server.js` remain available for integrations.
