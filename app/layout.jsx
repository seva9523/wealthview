import './globals.css';

export const metadata = {
  title: 'WealthView.pro — Stellar Treasury Intelligence',
  description: 'Read-only Stellar treasury intelligence for wallets, assets, SEP-41 tokens, builders, DAOs, startups, and AI agents.',
  metadataBase: new URL('https://wealthview.pro')
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
