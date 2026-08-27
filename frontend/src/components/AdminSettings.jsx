import React, { useState } from 'react';
import { api } from '../api';

export default function AdminSettings({ settings, onUpdated }) {
  const [price, setPrice] = useState(settings.subscription_price);
  const [ecocash, setEcocash] = useState(settings.ecocash_number);
  const [adPrice, setAdPrice] = useState(settings.ad_price_per_day);
  const [maxAds, setMaxAds] = useState(settings.max_active_ads);
  const [autoWaive, setAutoWaive] = useState(settings.auto_waive_new_vendors);
  const [autoWaiveDays, setAutoWaiveDays] = useState(settings.auto_waive_days);
  const [installPromptEnabled, setInstallPromptEnabled] = useState(settings.install_prompt_enabled);
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
        auto_waive_new_vendors: autoWaive,
        auto_waive_days: Number(autoWaiveDays),
        install_prompt_enabled: installPromptEnabled,
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
        <label className="radio-label">
          <input type="checkbox" checked={autoWaive} onChange={(e) => setAutoWaive(e.target.checked)} />
          Auto-waive new vendors' first subscription
        </label>
        {autoWaive && (
          <label>
            Free trial length (days)
            <input type="number" min="1" value={autoWaiveDays} onChange={(e) => setAutoWaiveDays(e.target.value)} />
          </label>
        )}
        <label className="radio-label">
          <input
            type="checkbox"
            checked={installPromptEnabled}
            onChange={(e) => setInstallPromptEnabled(e.target.checked)}
          />
          Show the "Install Tsvaga" banner to users
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="badge status-delivered" style={{ marginLeft: 10 }}>Saved</span>}
      </form>
      {autoWaive && (
        <p className="hint" style={{ marginTop: 8 }}>
          New vendors get {autoWaiveDays} days of free access automatically. Each phone number can only ever receive
          this once, even if the account is later deleted and re-registered.
        </p>
      )}
    </div>
  );
}
