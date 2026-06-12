export function sendJson(response, payload, status = 200) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
  response.status(status).json(payload);
}

export function handleOptions(request, response) {
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.status(204).end();
    return true;
  }
  return false;
}

export function readQueryValue(request, key, fallback = '') {
  const value = request.query?.[key];
  if (Array.isArray(value)) return value.join(',');
  return value ?? fallback;
}
