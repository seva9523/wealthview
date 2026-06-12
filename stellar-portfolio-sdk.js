export class WealthViewClient {
  constructor({ baseUrl = '' } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(path) {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`WealthView request failed: ${response.status}`);
    }
    const body = await response.json();
    return body.data ?? body;
  }

  snapshot() {
    return this.request('/api/snapshot');
  }

  history(limit = 30) {
    return this.request(`/api/history?limit=${encodeURIComponent(limit)}`);
  }

  signals() {
    return this.request('/api/signals');
  }

  intelligence() {
    return this.request('/api/intelligence');
  }

  aggregate() {
    return this.request('/api/aggregate');
  }
}

export function createWealthViewClient(options) {
  return new WealthViewClient(options);
}

if (typeof window !== 'undefined') {
  window.WealthViewClient = WealthViewClient;
  window.createWealthViewClient = createWealthViewClient;
}
