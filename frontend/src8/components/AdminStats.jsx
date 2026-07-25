import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function AdminStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/stats').then(({ data }) => setStats(data));
  }, []);

  if (!stats) return null;

  const rows = [
    ['Requesters', stats.users_by_role.requester || 0],
    ['Vendors', stats.total_vendors],
    ['Admins', stats.users_by_role.admin || 0],
    ['Requests (last 24h)', stats.requests_last_24h],
    ['Requests (last 7 days)', stats.requests_last_7d],
    ['Requests (last 30 days)', stats.requests_last_30d],
    ['Orders completed (total)', stats.orders_completed_total],
    ['Orders completed (last 30 days)', stats.orders_completed_last_30d],
    ['Active subscriptions', stats.active_subscriptions],
    ['Active ads running', stats.active_ads],
  ];

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Usage statistics</h2>
      <div className="stats-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
