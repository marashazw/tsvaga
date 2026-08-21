import React, { useState } from 'react';
import { api } from '../api';

export default function DeleteAccountLink({ onDeleted }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleDelete(e) {
    e.preventDefault();
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete('/auth/me', { data: { password } });
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete account');
      setDeleting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="link-btn"
        onClick={() => setOpen(true)}
        style={{ fontSize: '0.75rem', color: '#a03c3c', marginTop: 4 }}
      >
        Delete my account
      </button>
    );
  }

  return (
    <div className="panel subscription-panel unpaid" style={{ maxWidth: 380, margin: '10px auto', textAlign: 'left' }}>
      <strong>Delete your account?</strong>
      <p className="hint">
        This permanently removes your name, phone number, and password - you won't be able to log in again, and
        this can't be undone.
      </p>
      <form onSubmit={handleDelete}>
        <label>
          Confirm your password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontWeight: 400, fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ width: 'auto', marginTop: 2 }}
          />
          I understand this is permanent.
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={deleting || !confirmed}>
          {deleting ? 'Deleting…' : 'Confirm delete'}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)} style={{ marginLeft: 8 }}>
          Cancel
        </button>
      </form>
    </div>
  );
}
