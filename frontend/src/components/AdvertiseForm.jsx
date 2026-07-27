import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function AdvertiseForm({ prefill, onSubmitted }) {
  const [open, setOpen] = useState(!!prefill);
  const [pricing, setPricing] = useState(null);
  const [adType, setAdType] = useState(prefill?.ad_type || 'text');
  const [title, setTitle] = useState(prefill?.title || '');
  const [body, setBody] = useState(prefill?.body || '');
  const [videoUrl, setVideoUrl] = useState(prefill?.video_url || '');
  const [imageUrl, setImageUrl] = useState(prefill?.image_url || '');
  const [linkUrl, setLinkUrl] = useState(prefill?.link_url || '');
  const [whatsappNumber, setWhatsappNumber] = useState(prefill?.whatsapp_number || '');
  const [durationDays, setDurationDays] = useState(prefill?.duration_days || 7);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && !pricing) {
      api.get('/ads/pricing').then(({ data }) => setPricing(data));
    }
  }, [open, pricing]);

  const estimatedCost = pricing ? (Number(pricing.ad_price_per_day) * Number(durationDays || 0)).toFixed(2) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/ads', {
        ad_type: adType,
        title,
        body: body || undefined,
        video_url: adType === 'video' ? videoUrl : undefined,
        image_url: imageUrl || undefined,
        link_url: linkUrl || undefined,
        whatsapp_number: whatsappNumber || undefined,
        duration_days: Number(durationDays),
        amount: Number(estimatedCost),
        ecocash_reference: reference || undefined,
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit ad');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="link-btn" type="button" onClick={() => setOpen(true)}>
        📢 Advertise with us
      </button>
    );
  }

  if (submitted) {
    return (
      <div className="panel" style={{ marginTop: 12 }}>
        <p className="badge status-confirmed">Ad submitted — awaiting admin approval. It'll go live once confirmed.</p>
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>📢 {prefill ? 'Renew this ad' : 'Advertise with us'}</h3>
      <p className="hint">
        Ads run in their own dedicated space — never covering the map or any form. Anyone can advertise, not just
        vendors.
      </p>
      <form onSubmit={handleSubmit} className="request-form">
        <fieldset className="fulfillment-choice">
          <legend>Ad type</legend>
          <label className="radio-label">
            <input type="radio" checked={adType === 'text'} onChange={() => setAdType('text')} />
            Text / image
          </label>
          <label className="radio-label">
            <input type="radio" checked={adType === 'video'} onChange={() => setAdType('video')} />
            Video (you host the file/link — we don't accept uploads)
          </label>
        </fieldset>

        <label>
          Title
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
          <span className="hint" style={{ display: 'block', textAlign: 'right' }}>{title.length}/100</span>
        </label>
        <label>
          Description (optional)
          <input type="text" value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} />
          <span className="hint" style={{ display: 'block', textAlign: 'right' }}>{body.length}/300</span>
        </label>
        {adType === 'video' ? (
          <label>
            Video URL (direct file link)
            <input type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} maxLength={500} required />
          </label>
        ) : (
          <label>
            Image URL (optional)
            <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} maxLength={500} />
          </label>
        )}
        <label>
          Click-through link (optional)
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            maxLength={500}
          />
        </label>
        <label>
          WhatsApp contact number (optional)
          <input
            type="text"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="+263 7... (international format)"
            maxLength={20}
          />
          <span className="hint" style={{ display: 'block', marginTop: 4 }}>
            Shows a "Chat on WhatsApp" button that opens a pre-written message mentioning your ad — often gets more
            responses than a plain link.
          </span>
        </label>
        <label>
          Run for how many days?
          <input
            type="number"
            min="1"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            required
          />
        </label>

        {pricing && (
          <p className="hint">
            ${pricing.ad_price_per_day}/day × {durationDays || 0} days = <strong>${estimatedCost}</strong>. Send via
            EcoCash to <strong>{pricing.ecocash_number}</strong>, then confirm below.
          </p>
        )}
        <label>
          EcoCash reference (optional)
          <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : "I've paid — submit ad"}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)} style={{ marginLeft: 8 }}>
          Cancel
        </button>
      </form>
    </div>
  );
}
