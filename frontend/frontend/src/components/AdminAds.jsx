import React from 'react';
import { api } from '../api';

export default function AdminAds({ ads, onReviewed }) {
  async function approve(id) {
    const { data } = await api.patch(`/admin/ads/${id}/approve`, {});
    onReviewed(id, data);
  }

  async function reject(id) {
    await api.patch(`/admin/ads/${id}/reject`, {});
    onReviewed(id, null);
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Pending ads</h2>
      {ads.length === 0 ? (
        <p className="hint">No pending ads right now.</p>
      ) : (
        <ul className="order-list">
          {ads.map((ad) => (
            <li key={ad.id} className="order-card">
              <div className="alert-main">
                <strong>{ad.title}</strong>
                <span className="price">${Number(ad.amount).toFixed(2)}</span>
              </div>
              <p className="hint">
                {ad.owner_name} ({ad.owner_phone}) · {ad.ad_type} · {ad.duration_days} days ·{' '}
                {ad.ecocash_reference ? `Ref: ${ad.ecocash_reference}` : 'No reference given'}
              </p>
              {ad.body && <p className="hint">"{ad.body}"</p>}
              {ad.video_url && <p className="hint">Video: {ad.video_url}</p>}
              {ad.link_url && <p className="hint">Link: {ad.link_url}</p>}
              <div className="admin-actions">
                <button onClick={() => approve(ad.id)}>Approve</button>
                <button className="secondary" onClick={() => reject(ad.id)}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
