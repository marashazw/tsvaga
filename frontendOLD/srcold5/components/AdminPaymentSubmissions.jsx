import React from 'react';
import { api } from '../api';

export default function AdminPaymentSubmissions({ submissions, onReviewed }) {
  async function approve(id) {
    const { data } = await api.patch(`/admin/payment-submissions/${id}/approve`, {});
    onReviewed(id, 'approved', data.subscription);
  }

  async function reject(id) {
    await api.patch(`/admin/payment-submissions/${id}/reject`, {});
    onReviewed(id, 'rejected');
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Pending payment confirmations</h2>
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
                {s.phone} · {s.ecocash_reference ? `Ref: ${s.ecocash_reference}` : 'No reference given'} ·{' '}
                {new Date(s.created_at).toLocaleString()}
              </p>
              <div className="admin-actions">
                <button onClick={() => approve(s.id)}>Approve (activate 1 month)</button>
                <button className="secondary" onClick={() => reject(s.id)}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
