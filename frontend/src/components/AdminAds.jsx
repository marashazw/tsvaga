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
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Description
        <input value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {ad.ad_type === 'video' ? (
        <label>
          Video URL
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
        </label>
      ) : (
        <label>
          Image URL
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        </label>
      )}
      <label>
        Link URL
        <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
      </label>
      <label>
        WhatsApp number
        <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+263 7..." />
      </label>
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      <button type="button" className="secondary" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>
    </form>
  );
}

function AdCard({ ad, showApprove, onApprove, onReject, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);

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
          <button className="secondary" onClick={() => setEditing(true)}>Edit</button>
          <button className="secondary" onClick={remove}>Delete</button>
        </div>
      )}
    </li>
  );
}

export default function AdminAds({ pendingAds, activeAds, onPendingChanged, onActiveChanged }) {
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
    </div>
  );
}
