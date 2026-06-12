# Deploy WealthView Now

Use this checklist to deploy WealthView from the repository.

## GitHub Pages

1. Merge the deployment PR into `main`.
2. Open repository **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Run **Actions → Deploy WealthView Pages → Run workflow**.
5. Confirm the published URL shown by the workflow.

> Note: `CNAME` is set to `wealthview.app`. Update it before deployment if your production domain is different.

## Vercel

1. Import the repository into Vercel.
2. Use the default framework preset (`Other`).
3. Confirm Vercel uses the repository `vercel.json` settings: build command `npm run build` and output directory `dist`.
4. Deploy. Vercel automatically exposes the functions in `api/`.
5. If the production URL previously showed `404 NOT_FOUND`, trigger a redeploy after merging this PR so Vercel rebuilds `dist/index.html`.

## Required deployment files

This bundle contains the required static files, API routes, shared libraries, MCP metadata, and deployment configuration needed to publish WealthView.
