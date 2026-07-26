const express = require('express');
const router = express.Router();

// GET /api/geocode?q=<address text>
// Thin server-side proxy to OpenStreetMap's free Nominatim geocoder,
// restricted to Zimbabwe. Kept on the backend (rather than called directly
// from the browser) so we can send a proper identifying User-Agent, as
// Nominatim's usage policy asks for - browsers won't let JS override that
// header themselves.
router.get('/', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'A search address is required' });
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=zw&q=${encodeURIComponent(
      q.trim()
    )}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Tsvaga/1.0 (Zimbabwe local marketplace app)' },
    });
    if (!response.ok) throw new Error(`Nominatim responded with ${response.status}`);
    const results = await response.json();
    if (!results.length) {
      return res.status(404).json({ error: "Couldn't find that address in Zimbabwe - try a nearby landmark or suburb, or drop the pin manually." });
    }
    const top = results[0];
    res.json({ lat: parseFloat(top.lat), lng: parseFloat(top.lon), display_name: top.display_name });
  } catch (err) {
    console.error('Geocode lookup failed:', err);
    res.status(502).json({ error: 'Address lookup failed - try again, or drop the pin manually.' });
  }
});

module.exports = router;
