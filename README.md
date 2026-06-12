# WealthView

WealthView is a lightweight deployment bundle for a Stellar-oriented treasury and portfolio dashboard. It includes a static dashboard, demo page, Vercel-compatible API routes, MCP metadata, and GitHub Pages deployment workflow.

## What is included

- `index.html` — production landing dashboard.
- `demo.html` — interactive SDK/API demo.
- `stellar-portfolio-sdk.js` — browser-friendly SDK wrapper.
- `api/` — Vercel serverless endpoints for snapshots, history, signals, and intelligence.
- `lib/` — shared data and scoring helpers.
- `public/openapi.json` and `public/agent.json` — agent/API discovery metadata.
- `.github/workflows/deploy-pages.yml` — GitHub Pages deployment workflow.

## Local checks

```bash
npm run check
```

## Static build

```bash
npm run build
```

The build command writes the static website to `dist/`. Vercel is configured to run this command and serve `dist/index.html`, which prevents root URL 404s on deployments such as `https://wealthview-khaki.vercel.app/`.

## Deploy

### GitHub Pages

1. Merge this branch into `main`.
2. In GitHub, go to **Settings → Pages** and select **GitHub Actions** as the source.
3. Run the **Deploy WealthView Pages** workflow or push to `main`. The workflow builds the static site and uploads `dist/`.

### Vercel

1. Import the repository into Vercel.
2. Vercel reads `vercel.json`, runs `npm run build`, and serves the `dist/` output directory.
3. Vercel will serve the API files in `api/` as serverless functions.

See `DEPLOY_NOW.md` for a quick deployment checklist.
