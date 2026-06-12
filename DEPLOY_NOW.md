# Deploy WealthView.pro

1. Merge the PR into the Vercel-connected branch.
2. In Vercel, ensure the project framework is **Next.js**.
3. Use `npm install` as the install command and `npm run build` as the build command.
4. Leave Output Directory unset so Vercel uses the Next.js default.
5. Redeploy.

The app is read-only. It requires no wallet connection, signing, authentication, custody, trading, or database. All dashboard values are derived from live wallet input and aggregation results.
