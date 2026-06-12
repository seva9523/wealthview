# Deploy WealthView.pro

1. Merge the PR into the Vercel-connected branch.
2. In Vercel, set the project framework to **Next.js**.
3. Use `npm install` as the install command and `npm run build` as the build command.
4. Leave Output Directory unset so Vercel uses the Next.js default.
5. Redeploy from Vercel.

If the existing Vercel project still has an old Output Directory override such as `public`, this PR also includes a complete static fallback at `public/index.html` so the root URL still renders the wallet-first WealthView experience instead of a 404. The preferred production mode remains the Next.js app.

The app is read-only. It requires no wallet connection, signing, authentication, custody, trading, or database. All dashboard values are derived from live wallet input and aggregation results.
