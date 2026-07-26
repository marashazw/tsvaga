import React, { useEffect, useState } from 'react';
import { api } from '../api';

// Renders in its own dedicated strip of the page - never as an overlay on
// top of the map or any functional text/form. Rotates through active ads if
// there's more than one.
export default function AdSlot() {
  const [ads, setAds] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    api.get('/ads/active').then(({ data }) => setAds(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (ads.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % ads.length), 8000);
    return () => clearInterval(timer);
  }, [ads.length]);

  if (!ads.length) return null;
  const ad = ads[index];

  const content = (
    <div className="ad-slot">
      <span className="ad-label">Sponsored</span>
      {ad.ad_type === 'video' && ad.video_url ? (
        <video src={ad.video_url} controls muted style={{ width: '100%', borderRadius: 8, marginTop: 6 }} />
      ) : ad.image_url ? (
        <img src={ad.image_url} alt={ad.title} style={{ width: '100%', borderRadius: 8, marginTop: 6 }} />
      ) : null}
      <h4 style={{ margin: '6px 0 2px' }}>{ad.title}</h4>
      {ad.body && <p className="hint" style={{ margin: 0 }}>{ad.body}</p>}
    </div>
  );

  return ad.link_url ? (
    <a href={ad.link_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
      {content}
    </a>
  ) : (
    content
  );
}
