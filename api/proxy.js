export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.query.health === 'true') {
    const hasKey = !!(process.env.VITE_POKEMONTCG_API_KEY || process.env.POKEMONTCG_API_KEY);
    return res.status(200).json({ status: 'ok', hasApiKey: hasKey });
  }

  const { endpoint, ...params } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint parameter' });
  }

  const allowed = ['cards', 'sets', 'types'];
  if (!allowed.includes(endpoint)) {
    return res.status(400).json({ error: 'Invalid endpoint' });
  }

  // Build URL
  const query = new URLSearchParams(params).toString();
  const url = `https://api.pokemontcg.io/v2/${endpoint}${query ? '?' + query : ''}`;

  try {
    const headers = {};
    // Check both env var names (VITE_ prefix and without)
    const apiKey = process.env.VITE_POKEMONTCG_API_KEY || process.env.POKEMONTCG_API_KEY;
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`API error: ${response.status} - ${text}`);
      return res.status(response.status).json({
        error: `API returned ${response.status}`,
        detail: text.slice(0, 200),
      });
    }

    const data = await response.json();

    // Cache on Vercel edge for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    return res.status(200).json(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(502).json({ error: 'Failed to reach Pokemon TCG API', detail: err.message });
  }
}
