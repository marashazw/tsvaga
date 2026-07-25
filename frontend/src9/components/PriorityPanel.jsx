import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function PriorityPanel() {
  const [info, setInfo] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.get('/vendors/me/priority').then(({ data }) => setInfo(data));
  }, []);

  if (!info) return null;
  const { current, packages, ecocash_number } = info;
  const isBoosted =
    current.priority_score > 0 && current.priority_expires_at && new Date(current.priority_expires_at) > new Date();
  const chosenPackage = packages.find((p) => p.id === selectedPackage);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!chosenPackage) return;
    setSubmitting(true);
    try {
      await api.post('/vendors/me/priority-submissions', {
        package_id: chosenPackage.id,
        amount: Number(chosenPackage.price),
        ecocash_reference: reference || undefined,
      });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>⭐ Priority ranking</h3>
      {isBoosted ? (
        <p className="badge status-delivered">
          Boosted — your offers rank above non-boosted vendors until{' '}
          {new Date(current.priority_expires_at).toLocaleDateString()}
        </p>
      ) : (
        <p className="hint">
          Your offers currently rank by price alone. Buy a boost to appear above other vendors on the requester's
          offer list, regardless of price.
        </p>
      )}

      {submitted ? (
        <p className="badge status-confirmed">Payment submitted — awaiting admin approval.</p>
      ) : (
        <form onSubmit={handleSubmit} className="inventory-form">
          <select value={selectedPackage} onChange={(e) => setSelectedPackage(e.target.value)} required>
            <option value="">Choose a package…</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — ${Number(p.price).toFixed(2)} / {p.duration_days} days
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="EcoCash reference (optional)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <button type="submit" disabled={submitting || !selectedPackage}>
            {submitting ? 'Submitting…' : "I've paid — confirm"}
          </button>
        </form>
      )}
      {chosenPackage && !submitted && (
        <p className="hint" style={{ marginTop: 8 }}>
          Send ${Number(chosenPackage.price).toFixed(2)} via EcoCash to <strong>{ecocash_number}</strong>, then submit
          above.
        </p>
      )}
    </div>
  );
}
