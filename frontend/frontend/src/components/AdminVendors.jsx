import React, { useState } from 'react';
import { api } from '../api';

function statusLabel(v) {
  if (v.subscription_status === 'waived') return 'Waived (free access)';
  if (v.subscription_status === 'active' && v.expires_at && new Date(v.expires_at) > new Date()) {
    return `Active until ${new Date(v.expires_at).toLocaleDateString()}`;
  }
  return 'Inactive';
}

function statusClass(v) {
  if (v.subscription_status === 'waived') return 'status-delivered';
  if (v.subscription_status === 'active' && v.expires_at && new Date(v.expires_at) > new Date()) {
    return 'status-delivered';
  }
  return 'status-cancelled';
}

function EditVendorForm({ vendor, onSaved, onCancel }) {
  const [businessName, setBusinessName] = useState(vendor.business_name);
  const [address, setAddress] = useState(vendor.address_text || '');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch(`/admin/vendors/${vendor.id}`, {
        business_name: businessName,
        address_text: address,
      });
      onSaved(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="settings-form" style={{ marginTop: 8 }}>
      <label>
        Shop name
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
      </label>
      <label>
        Address
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      <button type="button" className="secondary" onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>
    </form>
  );
}

export default function AdminVendors({ vendors, onChanged, onEdited, onDeleted }) {
  const [monthsByVendor, setMonthsByVendor] = useState({});
  const [editingId, setEditingId] = useState(null);

  async function activate(vendorId) {
    const months = Number(monthsByVendor[vendorId]) || 1;
    const { data } = await api.post(`/admin/vendors/${vendorId}/activate`, { months });
    onChanged(vendorId, data);
  }

  async function waive(vendorId) {
    const { data } = await api.post(`/admin/vendors/${vendorId}/activate`, { waive: true });
    onChanged(vendorId, data);
  }

  async function deactivate(vendorId) {
    const { data } = await api.post(`/admin/vendors/${vendorId}/deactivate`, {});
    onChanged(vendorId, data);
  }

  async function removeVendor(vendorId, name) {
    if (!window.confirm(`Delete "${name}" permanently? This can't be undone.`)) return;
    try {
      await api.delete(`/admin/vendors/${vendorId}`);
      onDeleted(vendorId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete vendor');
    }
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Vendors</h2>
      <ul className="order-list">
        {vendors.map((v) => (
          <li key={v.id} className="order-card">
            <div className="alert-main">
              <strong>{v.business_name}</strong>
              <span className={`badge ${statusClass(v)}`}>{statusLabel(v)}</span>
            </div>
            <p className="hint">{v.phone} · {v.address_text || 'No address set'}</p>

            {editingId === v.id ? (
              <EditVendorForm
                vendor={v}
                onSaved={(updated) => {
                  onEdited(v.id, updated);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="admin-actions">
                <input
                  type="number"
                  min="1"
                  placeholder="Months"
                  style={{ width: 80 }}
                  value={monthsByVendor[v.id] ?? 1}
                  onChange={(e) => setMonthsByVendor((m) => ({ ...m, [v.id]: e.target.value }))}
                />
                <button onClick={() => activate(v.id)}>Activate</button>
                <button className="secondary" onClick={() => waive(v.id)}>Waive (free)</button>
                <button className="secondary" onClick={() => deactivate(v.id)}>Deactivate</button>
                <button className="secondary" onClick={() => setEditingId(v.id)}>Edit</button>
                <button className="secondary" onClick={() => removeVendor(v.id, v.business_name)}>Delete</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
