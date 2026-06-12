export function parseSep41Holdings(value = '') {
  return String(value)
    .split(/[\n;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [code = 'TOKEN', contract = '', balance = '0', priceUsd = ''] = entry.split(':').map((part) => part.trim());
      const amount = Number(balance);
      const price = priceUsd === '' ? null : Number(priceUsd);
      return {
        wallet: 'soroban-contract',
        type: 'sep41',
        code: code.toUpperCase(),
        contract,
        issuer: null,
        balance: Number.isFinite(amount) ? amount : 0,
        priceUsd: Number.isFinite(price) ? price : null,
        valueUsd: Number.isFinite(price) && Number.isFinite(amount) ? amount * price : null,
        priced: Number.isFinite(price)
      };
    });
}

export const sep41Assets = [];
