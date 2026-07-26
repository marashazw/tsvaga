import React, { useState } from 'react';
import { api } from '../api';

export default function AdminPriorityPackages({ packages, onChanged }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [durationDays, setDurationDays] = useState(30);
  const [boostScore, setBoostScore] = useState(10);
  const [creating, setCreating] = useState(false);

  async function createPackage(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post('/admin/priority-packages', {
        name,
        price: Number(price),
        duration_days: Number(durationDays),
        boost_score: Number(boostScore),
      });
      onChanged([...packages, data]);
      setName('');
      setPrice('');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(pkg) {
    const { data } = await api.patch(`/admin/priority-packages/${pkg.id}`, { active: !pkg.active });
    onChanged(packages.map((p) => (p.id === pkg.id ? data : p)));
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Priority ranking packages</h2>
      <ul className="order-list">
        {packages.map((p) => (
          <li key={p.id} className="order-card">
            <div className="alert-main">
              <strong>{p.name}</strong>
              <span className="price">${Number(p.price).toFixed(2)}</span>
            </div>
            <p className="hint">
              {p.duration_days} days · boost score {p.boost_score}
            </p>
            <button className="secondary" onClick={() => toggleActive(p)}>
              {p.active ? 'Deactivate' : 'Activate'}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={createPackage} className="settings-form">
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Price ($)
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <label>
          Duration (days)
          <input type="number" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} required />
        </label>
        <label>
          Boost score
          <input type="number" value={boostScore} onChange={(e) => setBoostScore(e.target.value)} required />
        </label>
        <button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Add package'}
        </button>
      </form>
    </div>
  );
}
