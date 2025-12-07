// api/youtube-search.js
import fetch from 'node-fetch';

const PIPED_INSTANCE = 'https://pipedapi.tokhmi.xyz'; // puedes cambiar a pa.il.ax, etc.

export default async function handler(req, res) {
  // Vercel parsea query desde req.query
  const { q, limit = 8 } = req.query || {};

  if (!q) {
    return res.status(400).json({ success: false, error: 'Missing q' });
  }

  try {
    const url = `${PIPED_INSTANCE}/search?q=${encodeURIComponent(
      q
    )}&filter=videos&region=US`;
    const r = await fetch(url, { timeout: 4000 });
    if (!r.ok) {
      return res
        .status(r.status)
        .json({ success: false, error: 'Piped search error' });
    }
    const data = await r.json();

    const results = (Array.isArray(data) ? data : [])
      .slice(0, limit)
      .map((item) => {
        let vid = '';
        if (item.url && item.url.includes('watch?v=')) {
          vid = item.url.split('v=')[1]?.split('&')[0];
        } else {
          vid = item.videoId || item.id;
        }
        return {
          title: item.title,
          author: { name: item.uploader || item.uploaderName || '' },
          duration: item.duration, // string tipo "3:45"
          videoId: vid,
        };
      });

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('[api/youtube-search] error', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}