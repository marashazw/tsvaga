import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function AdminRequests() {
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState('');
  const [actingOn, setActingOn] = useState(null);

  useEffect(() => {
    load(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(q) {
    api
      .get('/admin/requests', { params: q ? { search: q } : {} })
      .then(({ data }) => setRequests(data))
      .catch(() => setError('Failed to load requests'));
  }

  function handleSearch(e) {
    e.preventDefault();
    load(search);
  }

  async function toggleActive(requestId, currentlyBlocked) {
    setActingOn(requestId);
    try {
      const endpoint = currentlyBlocked ? 'reactivate' : 'deactivate';
      const { data } = await api.patch(`/admin/requests/${requestId}/${endpoint}`);
      setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: data.status } : r)));
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed');
    } finally {
      setActingOn(null);
    }
  }

  async function toggleBlockUser(userId, currentlyBlocked) {
    const reason = currentlyBlocked
      ? null
      : window.prompt('Reason for blocking this user (shown only to admins):', 'Posted a prohibited request');
    if (!currentlyBlocked && reason === null) return;

    setActingOn(`user-${userId}`);
    try {
      const endpoint = currentlyBlocked ? 'unblock' : 'block';
      await api.patch(`/admin/users/${userId}/${endpoint}`, { reason });
      setRequests((prev) => prev.map((r) => (r.requester_id === userId ? { ...r, is_blocked: !currentlyBlocked } : r)));
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed');
    } finally {
      setActingOn(null);
    }
  }

  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      <h2>📋 Browse & moderate requests</h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        For catching requests that slip past the automatic content filter through slang or creative spelling.
        Deactivating pulls a request from view without deleting it - reactivate anytime.
      </p>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search by item text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit">Search</button>
      </form>

      {!requests ? (
        <p className="hint">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="hint">No requests found.</p>
      ) : (
        <ul className="order-list">
          {requests.map((r) => {
            const isBlockedRequest = r.status === 'blocked';
            return (
              <li key={r.id} className="order-card">
                <div className="alert-main">
                  <strong>{r.product_text}</strong>
                  <span className="hint">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.quantity && <p className="hint" style={{ margin: '2px 0' }}>Qty: {r.quantity}</p>}
                <p className="hint" style={{ margin: '2px 0 8px' }}>
                  {r.requester_name} ({r.requester_phone}) - status: {r.status}
                  {r.is_blocked && <span className="badge status-cancelled" style={{ marginLeft: 8 }}>User blocked</span>}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={isBlockedRequest ? '' : 'secondary'}
                    disabled={actingOn === r.id}
                    onClick={() => toggleActive(r.id, isBlockedRequest)}
                  >
                    {actingOn === r.id ? 'Working…' : isBlockedRequest ? 'Reactivate request' : 'Deactivate request'}
                  </button>
                  <button
                    type="button"
                    className={r.is_blocked ? 'secondary' : ''}
                    disabled={actingOn === `user-${r.requester_id}`}
                    onClick={() => toggleBlockUser(r.requester_id, r.is_blocked)}
                  >
                    {actingOn === `user-${r.requester_id}`
                      ? 'Working…'
                      : r.is_blocked
                        ? 'Unblock this user'
                        : 'Block this user'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
