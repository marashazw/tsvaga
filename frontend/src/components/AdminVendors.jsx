import React, { useMemo, useState } from 'react';
import { api } from '../api';

function isPaidUp(v) {
  return v.subscription_status === 'waived' || (v.subscription_status === 'active' && v.expires_at && new Date(v.expires_at) > new Date());
}

function isPaidActive(v) {
  return v.subscription_status === 'active' && v.expires_at && new Date(v.expires_at) > new Date();
}

function isWaived(v) {
  return v.subscription_status === 'waived';
}

function statusLabel(v) {
  if (v.subscription_status === 'waived') return 'Waived (free access)';
  if (v.subscription_status === 'active' && v.expires_at && new Date(v.expires_at) > new Date()) {
    const isTrial = v.note && v.note.toLowerCase().includes('trial');
    return `${isTrial ? 'Free trial' : 'Active'} until ${new Date(v.expires_at).toLocaleDateString()}`;
  }
  return 'Inactive';
}

function statusClass(v) {
  return isPaidUp(v) ? 'status-delivered' : 'status-cancelled';
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
  const [statusFilter, setStatusFilter] = useState('all'); // all | paid | waived | inactive
  const [sortBy, setSortBy] = useState('name'); // name | newest | location

  const visibleVendors = useMemo(() => {
    let list = vendors;
    if (statusFilter === 'paid') list = list.filter(isPaidActive);
    if (statusFilter === 'waived') list = list.filter(isWaived);
    if (statusFilter === 'inactive') list = list.filter((v) => !isPaidUp(v));

    const sorted = [...list];
    if (sortBy === 'newest') {
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'location') {
      sorted.sort((a, b) => (a.address_text || '').localeCompare(b.address_text || ''));
    } else {
      sorted.sort((a, b) => a.business_name.localeCompare(b.business_name));
    }
    return sorted;
  }, [vendors, statusFilter, sortBy]);

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
      <div className="alert-main">
        <h2 style={{ margin: 0 }}>Vendors ({visibleVendors.length})</h2>
      </div>

      <div className="admin-actions" style={{ marginBottom: 12 }}>
        <label className="hint">
          Show:{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="hint">
          Sort by:{' '}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Name (A-Z)</option>
            <option value="newest">Newest first</option>
            <option value="location">Location (A-Z)</option>
          </select>
        </label>
      </div>

      <ul className="order-list">
        {visibleVendors.map((v) => (
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
