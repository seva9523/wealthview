export const sep41Assets = [
  {
    code: 'USDC',
    issuer: 'GA5ZSEJYB37AHK65Q7VNW6UXKJQNLXRCQA4NQ3BSZGI5H3G5HENFUSDC',
    network: 'Stellar Public',
    decimals: 7
  },
  {
    code: 'XLM',
    issuer: 'native',
    network: 'Stellar Public',
    decimals: 7
  }
];

export function findAsset(code) {
  return sep41Assets.find((asset) => asset.code.toLowerCase() === String(code).toLowerCase());
}
