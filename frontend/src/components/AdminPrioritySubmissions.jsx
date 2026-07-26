import React from 'react';
import { api } from '../api';

export default function AdminPrioritySubmissions({ submissions, onReviewed }) {
  async function approve(id) {
    const { data } = await api.patch(`/admin/priority-submissions/${id}/approve`, {});
    onReviewed(id, 'approved', data.vendor);
  }

  async function reject(id) {
    await api.patch(`/admin/priority-submissions/${id}/reject`, {});
    onReviewed(id, 'rejected');
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Pending priority boost payments</h2>
      {submissions.length === 0 ? (
        <p className="hint">No pending submissions right now.</p>
      ) : (
        <ul className="order-list">
          {submissions.map((s) => (
            <li key={s.id} className="order-card">
              <div className="alert-main">
                <strong>{s.business_name}</strong>
                <span className="price">${Number(s.amount).toFixed(2)}</span>
              </div>
              <p className="hint">
                {s.phone} · {s.package_name} ({s.duration_days} days, boost {s.boost_score}) ·{' '}
                {s.ecocash_reference ? `Ref: ${s.ecocash_reference}` : 'No reference given'}
              </p>
              <div className="admin-actions">
                <button onClick={() => approve(s.id)}>Approve</button>
                <button className="secondary" onClick={() => reject(s.id)}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
