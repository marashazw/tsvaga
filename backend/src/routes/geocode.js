const express = require('express');
const router = express.Router();

// Nominatim's display_name is a full chain like "6 Drummond Road, Greendale,
// Harare, Harare Province, Zimbabwe" - most of that (suburb/town/province/
// country) isn't useful in a short location label, so we just keep the
// first, most specific segment (the street-level part).
function shortenAddress(displayName) {
  if (!displayName) return displayName;
  return displayName.split(',')[0].trim();
}

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
    res.json({ lat: parseFloat(top.lat), lng: parseFloat(top.lon), display_name: shortenAddress(top.display_name) });
  } catch (err) {
    console.error('Geocode lookup failed:', err);
    res.status(502).json({ error: 'Address lookup failed - try again, or drop the pin manually.' });
  }
});

// GET /api/geocode/reverse?lat=&lng=
// The opposite direction: coordinates -> a human-readable address. Used to
// auto-fill the address label whenever the pin is moved (drag, tap, or GPS)
// instead of leaving it blank until someone types a search. Same
// server-side-proxy reasoning as above.
router.get('/reverse', async (req, res) => {
  const { lat, lng } = req.query;
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Tsvaga/1.0 (Zimbabwe local marketplace app)' },
    });
    if (!response.ok) throw new Error(`Nominatim responded with ${response.status}`);
    const result = await response.json();
    if (!result || result.error || !result.display_name) {
      return res.status(404).json({ error: 'No address found for this location' });
    }
    res.json({ display_name: shortenAddress(result.display_name) });
  } catch (err) {
    console.error('Reverse geocode lookup failed:', err);
    res.status(502).json({ error: 'Could not look up an address for this location' });
  }
});

module.exports = router;
