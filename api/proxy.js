export default async function handler(req, res) {
  // Allow any origin (same-domain in production, localhost in dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, ...params } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint parameter' });
  }

  // Only allow known endpoints
  const allowed = ['cards', 'sets', 'types'];
  if (!allowed.includes(endpoint)) {
    return res.status(400).json({ error: 'Invalid endpoint' });
  }

  // Build the URL to Pokemon TCG API
  const query = new URLSearchParams(params).toString();
  const url = `https://api.pokemontcg.io/v2/${endpoint}${query ? '?' + query : ''}`;

  try {
    const headers = {};
    const apiKey = process.env.VITE_POKEMONTCG_API_KEY;
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `API returned ${response.status}`,
      });
    }

    const data = await response.json();
    
    // Cache successful responses for 5 minutes on Vercel's edge
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    
    return res.status(200).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Failed to reach Pokemon TCG API' });
  }
}
