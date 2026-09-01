import React, { useEffect, useState } from 'react';
import { api } from '../api';

const CONTEXT_LABELS = {
  request: 'Request',
  product: 'Product name',
  business_name: 'Shop name',
  offer: 'Offer message',
  offer_message: 'Chat message',
  ad: 'Advertisement',
  registration: 'Registration',
};

export default function AdminFlags() {
  const [flags, setFlags] = useState(null);
  const [error, setError] = useState('');
  const [actingOn, setActingOn] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .get('/admin/flagged-content')
      .then(({ data }) => setFlags(data))
      .catch(() => setError('Failed to load flagged content'));
  }

  async function toggleBlock(userId, currentlyBlocked) {
    const reason = currentlyBlocked
      ? null
      : window.prompt('Reason for blocking this user (shown only to admins):', 'Repeated prohibited content attempts');
    if (!currentlyBlocked && reason === null) return; // cancelled the prompt

    setActingOn(userId);
    try {
      const endpoint = currentlyBlocked ? 'unblock' : 'block';
      await api.patch(`/admin/users/${userId}/${endpoint}`, { reason });
      setFlags((prev) => prev.map((f) => (f.user_id === userId ? { ...f, is_blocked: !currentlyBlocked } : f)));
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed');
    } finally {
      setActingOn(null);
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === flags.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(flags.map((f) => f.id)));
    }
  }

  // Purely a housekeeping action - clearing entries from this log never
  // touches is_blocked. Reviewing a flag and deciding no action is needed
  // (a false positive, or already handled) shouldn't require unblocking
  // anyone, since blocking was never applied automatically in the first
  // place.
  async function clearSelected() {
    if (!selected.size) return;
    if (!window.confirm(`Clear ${selected.size} flagged entr${selected.size === 1 ? 'y' : 'ies'} from the log?`)) return;
    setClearing(true);
    try {
      await api.delete('/admin/flagged-content', { data: { ids: [...selected] } });
      setFlags((prev) => prev.filter((f) => !selected.has(f.id)));
      setSelected(new Set());
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to clear selected entries');
    } finally {
      setClearing(false);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!flags) return <p className="hint">Loading…</p>;

  return (
    <div>
      <h2>🚩 Flagged content</h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        Every submission blocked for containing prohibited content (weapons, drugs, human organs, sex toys,
        pornographic material), across every part of the app. The submission itself was always rejected outright -
        this is a record for spotting repeat offenders and catching anything the filter may have mis-flagged.
      </p>
      {flags.length === 0 ? (
        <p className="hint">Nothing flagged yet.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <label className="category-checkbox" style={{ padding: 0 }}>
              <input type="checkbox" checked={selected.size === flags.length} onChange={toggleSelectAll} />
              <span>Select all</span>
            </label>
            {selected.size > 0 && (
              <button type="button" className="secondary" disabled={clearing} onClick={clearSelected}>
                {clearing ? 'Clearing…' : `Clear ${selected.size} selected`}
              </button>
            )}
          </div>
          <ul className="order-list">
            {flags.map((f) => (
              <li key={f.id} className="order-card">
                <div className="alert-main">
                  <label className="category-checkbox" style={{ padding: 0 }}>
                    <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} />
                    <strong>{CONTEXT_LABELS[f.context] || f.context}</strong>
                  </label>
                  <span className="hint">{new Date(f.created_at).toLocaleString()}</span>
                </div>
                <p style={{ margin: '6px 0' }}>
                  <em>"{f.submitted_text}"</em>
                </p>
                <p className="hint" style={{ margin: '0 0 8px' }}>
                  {f.user_name ? `${f.user_name} (${f.user_phone}) - ${f.user_role}` : 'Unknown user (account deleted)'}
                  {f.is_blocked && <span className="badge status-cancelled" style={{ marginLeft: 8 }}>Blocked</span>}
                </p>
                {f.user_id && (
                  <button
                    type="button"
                    className={f.is_blocked ? 'secondary' : ''}
                    disabled={actingOn === f.user_id}
                    onClick={() => toggleBlock(f.user_id, f.is_blocked)}
                  >
                    {actingOn === f.user_id ? 'Working…' : f.is_blocked ? 'Unblock this user' : 'Block this user'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
