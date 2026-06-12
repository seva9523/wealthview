export class WealthViewClient {
  constructor({ baseUrl = '' } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(path, params = {}) {
    const search = params instanceof URLSearchParams ? params : new URLSearchParams(params);
    const query = search.toString();
    const response = await fetch(`${this.baseUrl}${path}${query ? `?${query}` : ''}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `WealthView request failed: ${response.status}`);
    }
    const body = await response.json();
    return body.data ?? body;
  }

  snapshot(params = {}) { return this.request('/api/snapshot', params); }
  history(params = {}) { return this.request('/api/history', params); }
  signals(params = {}) { return this.request('/api/signals', params); }
  intelligence(params = {}) { return this.request('/api/intelligence', params); }
  aggregate(params = {}) { return this.request('/api/aggregate', params); }
}

export function createWealthViewClient(options) {
  return new WealthViewClient(options);
}

if (typeof window !== 'undefined') {
  window.WealthViewClient = WealthViewClient;
  window.createWealthViewClient = createWealthViewClient;
}
