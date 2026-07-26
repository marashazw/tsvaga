import React, { useState } from 'react';
import { api } from '../api';

export default function AdminSettings({ settings, onUpdated }) {
  const [price, setPrice] = useState(settings.subscription_price);
  const [ecocash, setEcocash] = useState(settings.ecocash_number);
  const [adPrice, setAdPrice] = useState(settings.ad_price_per_day);
  const [maxAds, setMaxAds] = useState(settings.max_active_ads);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const { data } = await api.patch('/admin/settings', {
        subscription_price: Number(price),
        ecocash_number: ecocash,
        ad_price_per_day: Number(adPrice),
        max_active_ads: Number(maxAds),
      });
      onUpdated(data);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Platform settings</h2>
      <form onSubmit={handleSave} className="settings-form">
        <label>
          Subscription price ({settings.subscription_currency}/month)
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label>
          EcoCash number
          <input type="text" value={ecocash} onChange={(e) => setEcocash(e.target.value)} />
        </label>
        <label>
          Ad price ($/day)
          <input type="number" step="0.01" value={adPrice} onChange={(e) => setAdPrice(e.target.value)} />
        </label>
        <label>
          Max active ads at once
          <input type="number" min="1" value={maxAds} onChange={(e) => setMaxAds(e.target.value)} />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="badge status-delivered" style={{ marginLeft: 10 }}>Saved</span>}
      </form>
    </div>
  );
}
