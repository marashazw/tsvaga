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

export default function AdminVendors({ vendors, onChanged }) {
  const [monthsByVendor, setMonthsByVendor] = useState({});

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
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
