import React, { useEffect, useState } from 'react';
import { api } from '../api';

function statusLabel(status) {
  return {
    open: 'Waiting for offers',
    matched: 'Matched with a vendor',
    completed: 'Completed',
    cancelled: 'Cancelled',
    expired: 'Expired — no offers in time',
  }[status] || status;
}

function statusClass(status) {
  return {
    open: 'status-confirmed',
    matched: 'status-confirmed',
    completed: 'status-delivered',
    cancelled: 'status-cancelled',
    expired: 'status-cancelled',
  }[status] || '';
}

export default function MyRequests() {
  const [requests, setRequests] = useState(null); // null = still loading
  const [visibleCount, setVisibleCount] = useState(10);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api
      .get('/requests/me')
      .then(({ data }) => setRequests(data))
      .catch(() => setRequests([]));
  }, []);

  if (requests === null) return null;
  if (!requests.length) return null;

  const visible = requests.slice(0, visibleCount);

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>My requests</h2>
      <ul className="order-list">
        {visible.map((r) => (
          <li key={r.id} className="order-card">
            <div className="alert-main">
              <strong>{r.product_text}</strong>
              <span className={`badge ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
            </div>
            <p className="hint" style={{ margin: '2px 0 0' }}>
              {r.quantity && `Qty: ${r.quantity} · `}
              {r.offer_count} offer{r.offer_count === '1' ? '' : 's'} · {new Date(r.created_at).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>

      {requests.length > 10 && (
        <div className="category-accordion" style={{ marginTop: 10 }}>
          <button type="button" className="category-accordion-toggle" onClick={() => setExpanded((e) => !e)}>
            <span>Showing {Math.min(visibleCount, requests.length)} of {requests.length} requests</span>
            <span>{expanded ? '▲' : '▼ show more'}</span>
          </button>
          {expanded && (
            <div className="category-accordion-body">
              <div className="admin-actions">
                {[10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={visibleCount === n ? undefined : 'secondary'}
                    onClick={() => setVisibleCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
