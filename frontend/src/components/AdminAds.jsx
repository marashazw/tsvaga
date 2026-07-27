import React, { useState } from 'react';
import { api } from '../api';

function EditAdForm({ ad, onSaved, onCancel }) {
  const [title, setTitle] = useState(ad.title);
  const [body, setBody] = useState(ad.body || '');
  const [videoUrl, setVideoUrl] = useState(ad.video_url || '');
  const [imageUrl, setImageUrl] = useState(ad.image_url || '');
  const [linkUrl, setLinkUrl] = useState(ad.link_url || '');
  const [whatsappNumber, setWhatsappNumber] = useState(ad.whatsapp_number || '');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch(`/admin/ads/${ad.id}`, {
        title,
        body,
        video_url: videoUrl,
        image_url: imageUrl,
        link_url: linkUrl,
        whatsapp_number: whatsappNumber,
      });
      onSaved(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="settings-form" style={{ marginTop: 8 }}>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
      </label>
      <label>
        Description
        <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} />
      </label>
      {ad.ad_type === 'video' ? (
        <label>
          Video URL
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} maxLength={500} />
        </label>
      ) : (
        <label>
          Image URL
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} maxLength={500} />
        </label>
      )}
      <label>
        Link URL
        <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} maxLength={500} />
      </label>
      <label>
        WhatsApp number
        <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+263 7..." maxLength={20} />
      </label>
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      <button type="button" className="secondary" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>
    </form>
  );
}

function AdCard({ ad, showApprove, showReactivate, onApprove, onReject, onReactivate, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [reactivateDays, setReactivateDays] = useState(ad.duration_days || 7);

  async function remove() {
    if (!window.confirm(`Delete "${ad.title}" permanently? This can't be undone.`)) return;
    await api.delete(`/admin/ads/${ad.id}`);
    onDeleted(ad.id);
  }

  return (
    <li className="order-card">
      <div className="alert-main">
        <strong>{ad.title}</strong>
        <span className="price">${Number(ad.amount).toFixed(2)}</span>
      </div>
      <p className="hint">
        {ad.owner_name} ({ad.owner_phone}) · {ad.ad_type} · {ad.duration_days} days
        {ad.ecocash_reference ? ` · Ref: ${ad.ecocash_reference}` : ''}
      </p>
      {ad.status === 'expired' && ad.ends_at && (
        <p className="hint">
          Expired {new Date(ad.ends_at).toLocaleDateString()} — auto-deleted 15 days after expiry unless re-activated.
        </p>
      )}
      {ad.body && <p className="hint">"{ad.body}"</p>}
      {ad.video_url && <p className="hint">Video: {ad.video_url}</p>}
      {ad.link_url && <p className="hint">Link: {ad.link_url}</p>}
      {ad.whatsapp_number && <p className="hint">WhatsApp: {ad.whatsapp_number}</p>}

      {editing ? (
        <EditAdForm
          ad={ad}
          onSaved={(updated) => {
            onSaved(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="admin-actions">
          {showApprove && (
            <>
              <button onClick={() => onApprove(ad.id)}>Approve</button>
              <button className="secondary" onClick={() => onReject(ad.id)}>Reject</button>
            </>
          )}
          {showReactivate && (
            <>
              <input
                type="number"
                min="1"
                value={reactivateDays}
                onChange={(e) => setReactivateDays(e.target.value)}
                style={{ width: 70 }}
                title="Days to run"
              />
              <button onClick={() => onReactivate(ad.id, Number(reactivateDays))}>Re-activate / extend</button>
            </>
          )}
          <button className="secondary" onClick={() => setEditing(true)}>Edit</button>
          <button className="secondary" onClick={remove}>Delete</button>
        </div>
      )}
    </li>
  );
}

export default function AdminAds({ pendingAds, activeAds, expiredAds, onPendingChanged, onActiveChanged, onExpiredChanged }) {
  async function approve(id) {
    try {
      const { data } = await api.patch(`/admin/ads/${id}/approve`, {});
      onPendingChanged(pendingAds.filter((a) => a.id !== id));
      onActiveChanged([...activeAds, data]);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve ad');
    }
  }

  async function reject(id) {
    await api.patch(`/admin/ads/${id}/reject`, {});
    onPendingChanged(pendingAds.filter((a) => a.id !== id));
  }

  async function reactivate(id, days) {
    try {
      const { data } = await api.patch(`/admin/ads/${id}/approve`, { duration_days: days });
      onExpiredChanged(expiredAds.filter((a) => a.id !== id));
      onActiveChanged([...activeAds, data]);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to re-activate ad');
    }
  }

  function handleSaved(updated, list, setList) {
    setList(list.map((a) => (a.id === updated.id ? updated : a)));
  }

  function handleDeleted(id, list, setList) {
    setList(list.filter((a) => a.id !== id));
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Pending ads</h2>
      {pendingAds.length === 0 ? (
        <p className="hint">No pending ads right now.</p>
      ) : (
        <ul className="order-list">
          {pendingAds.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              showApprove
              onApprove={approve}
              onReject={reject}
              onSaved={(updated) => handleSaved(updated, pendingAds, onPendingChanged)}
              onDeleted={(id) => handleDeleted(id, pendingAds, onPendingChanged)}
            />
          ))}
        </ul>
      )}

      <h2>Active ads</h2>
      {activeAds.length === 0 ? (
        <p className="hint">No ads currently running.</p>
      ) : (
        <ul className="order-list">
          {activeAds.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              showApprove={false}
              onSaved={(updated) => handleSaved(updated, activeAds, onActiveChanged)}
              onDeleted={(id) => handleDeleted(id, activeAds, onActiveChanged)}
            />
          ))}
        </ul>
      )}

      <h2>Expired ads <span className="hint">(kept 15 days, then auto-deleted)</span></h2>
      {expiredAds.length === 0 ? (
        <p className="hint">No recently expired ads.</p>
      ) : (
        <ul className="order-list">
          {expiredAds.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              showReactivate
              onReactivate={reactivate}
              onSaved={(updated) => handleSaved(updated, expiredAds, onExpiredChanged)}
              onDeleted={(id) => handleDeleted(id, expiredAds, onExpiredChanged)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
