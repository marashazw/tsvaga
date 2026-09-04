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

function daysLeft(visibleUntil) {
  // A delivered order's visible_until is set to Postgres 'infinity' server-
  // side (see orders.js), which the pg driver converts to the JS Infinity
  // number - and JSON.stringify(Infinity) becomes null over the wire. If
  // this isn't handled explicitly, new Date(null) evaluates to the 1970
  // epoch, which would wrongly show "leaves your log today" for a request
  // that should actually never expire.
  if (visibleUntil == null) return Infinity;
  return Math.max(0, Math.ceil((new Date(visibleUntil) - new Date()) / (24 * 60 * 60 * 1000)));
}

const compactBtnStyle = { padding: '4px 10px', fontSize: '0.78rem' };

function SuggestedVendors({ requestId, requestType }) {
  const [vendors, setVendors] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api
      .get(`/requests/${requestId}/suggested-vendors`)
      .then(({ data }) => setVendors(data))
      .catch(() => setVendors([]));
  }, [requestId]);

  if (!vendors || vendors.length === 0) return null;

  const visible = showAll ? vendors : vendors.slice(0, 5);

  const isService = requestType === 'service';
  const count = vendors.length;
  const headerMessage = isService
    ? count === 1
      ? '1 provider nearby already offers this'
      : `${count} providers nearby already offer this`
    : count === 1
      ? '1 vendor nearby already has this in stock'
      : `${count} vendors nearby already have this in stock`;

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <p className="hint" style={{ margin: '0 0 6px', fontWeight: 600 }}>
        🏪 {headerMessage} — contact directly instead of waiting:
      </p>
      {visible.map((v) => {
        const distanceKm = (v.distance_m / 1000).toFixed(1);
        const waMessage = encodeURIComponent(
          isService
            ? `Hi ${v.business_name}, I saw on Tsvaga that you offer ${v.product_name}. Is this still available?`
            : `Hi ${v.business_name}, I saw on Tsvaga that you have ${v.product_name} in stock. Is it still available?`
        );
        return (
          <div
            key={v.vendor_id}
            style={{ border: '1px solid #e7ddc9', borderRadius: 10, padding: '8px 10px', marginBottom: 6 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong style={{ fontSize: '0.88rem' }}>
                {v.business_name}
                {v.vendor_priority > 0 && (
                  <span className="badge status-delivered" style={{ marginLeft: 6, fontSize: '0.7rem' }}>⭐</span>
                )}
                {v.rating_avg != null && (
                  <span className="hint" style={{ marginLeft: 6, fontWeight: 400 }}>★ {Number(v.rating_avg).toFixed(1)}</span>
                )}
              </strong>
              <span style={{ fontWeight: 700, color: 'var(--clay)' }}>
                {v.typical_price != null
                  ? v.pricing_type === 'hourly'
                    ? `$${Number(v.typical_price).toFixed(2)}/hr`
                    : v.pricing_type === 'starting_from'
                      ? `From $${Number(v.typical_price).toFixed(2)}`
                      : `$${Number(v.typical_price).toFixed(2)}`
                  : 'Price on request'}
              </span>
            </div>
            <p className="hint" style={{ margin: '2px 0' }}>
              {v.product_name} · {distanceKm} km away
            </p>
            {v.address_text && <p className="hint" style={{ margin: '0 0 4px' }}>📍 {v.address_text}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <a href={`tel:${v.vendor_phone}`} style={{ color: 'var(--forest)', fontSize: '0.85rem', fontWeight: 600 }}>
                📞 Call
              </a>
              <a
                href={`https://wa.me/${v.vendor_phone.replace(/[^0-9]/g, '')}?text=${waMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--clay)', fontSize: '0.85rem', fontWeight: 600 }}
              >
                💬 WhatsApp
              </a>
            </div>
          </div>
        );
      })}
      {!showAll && vendors.length > 5 && (
        <button type="button" className="secondary" style={compactBtnStyle} onClick={() => setShowAll(true)}>
          Show {vendors.length - 5} more
        </button>
      )}
    </div>
  );
}

function RequestCard({ r, checked, onCheckToggle, onChanged, onDeleted, onViewOffers, onViewOrder, onReorder }) {
  const [editing, setEditing] = useState(false);
  const [productText, setProductText] = useState(r.product_text);
  const [quantity, setQuantity] = useState(r.quantity || '');
  const [saving, setSaving] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch(`/requests/${r.id}`, { product_text: productText, quantity });
      onChanged({ ...r, ...data });
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function renew() {
    setRenewing(true);
    setError(null);
    try {
      const { data } = await api.post(`/requests/${r.id}/renew`, {});
      onChanged({ ...r, ...data.request });
      alert(
        data.alerted_vendors > 0
          ? `Re-sent to ${data.alerted_vendors} nearby vendor${data.alerted_vendors === 1 ? '' : 's'}.`
          : 'Renewed, but no matching vendors are online nearby right now.'
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to renew');
    } finally {
      setRenewing(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${r.product_text}"? This can't be undone.`)) return;
    try {
      await api.delete(`/requests/${r.id}`);
      onDeleted(r.id);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  }

  const left = daysLeft(r.visible_until);

  return (
    <li className="order-card">
      <div className="alert-main">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <input type="checkbox" checked={checked} onChange={onCheckToggle} />
          {editing ? (
            <input
              type="text"
              value={productText}
              onChange={(e) => setProductText(e.target.value)}
              style={{ flex: 1, fontSize: '0.9rem' }}
            />
          ) : (
            <strong style={{ fontSize: '0.9rem', fontWeight: 600 }}>{r.product_text}</strong>
          )}
        </label>
        <span className={`badge ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
        <span className="hint" style={{ marginLeft: 6, whiteSpace: 'nowrap' }}>
          {r.request_type === 'service' ? '🔧 Service' : '🛒 Product'}
        </span>
      </div>

      {editing ? (
        <div style={{ marginTop: 6 }}>
          <input
            type="text"
            placeholder="Quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ marginRight: 8 }}
          />
          <button type="button" onClick={save} disabled={saving} style={compactBtnStyle}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="secondary" onClick={() => setEditing(false)} style={{ ...compactBtnStyle, marginLeft: 8 }}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <p className="hint" style={{ margin: '2px 0 0' }}>
            {r.quantity && `Qty: ${r.quantity} · `}
            {r.offer_count} offer{r.offer_count === '1' ? '' : 's'} · {new Date(r.created_at).toLocaleDateString()}
          </p>
          {r.status === 'open' && Number(r.offer_count) > 0 && onViewOffers && (
            <button type="button" style={{ marginTop: 4 }} onClick={() => onViewOffers(r.id)}>
              View {r.offer_count} offer{r.offer_count === '1' ? '' : 's'} — accept or message
            </button>
          )}
          {r.status === 'matched' && r.order_id && r.order_status === 'delivered' && r.has_review ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span className="badge status-delivered">✅ Delivered</span>
              {onReorder && (
                <button type="button" className="secondary" onClick={() => onReorder(r)}>
                  Request this again
                </button>
              )}
            </div>
          ) : (
            r.status === 'matched' && r.order_id && onViewOrder && (
              <button type="button" style={{ marginTop: 4 }} onClick={() => onViewOrder(r.order_id)}>
                {r.order_status === 'delivered'
                  ? 'Delivered — leave a review'
                  : 'View order status — track & message vendor'}
              </button>
            )
          )}
          {r.status === 'open' && <SuggestedVendors requestId={r.id} requestType={r.request_type} />}
          <p className="hint" style={{ margin: '2px 0 6px', fontStyle: 'italic' }}>
            {left === Infinity
              ? 'Kept in your history log permanently'
              : `${left <= 1 ? 'Leaves your history log today' : `On your history log for ${left} more day${left === 1 ? '' : 's'}`} unless renewed`}
          </p>
          {checked && (
            <div className="admin-actions">
              {r.status === 'open' && (
                <button type="button" className="secondary" onClick={() => setEditing(true)} style={compactBtnStyle}>
                  Edit
                </button>
              )}
              {r.status !== 'matched' && r.status !== 'completed' && (
                <button type="button" className="secondary" onClick={renew} disabled={renewing} style={compactBtnStyle}>
                  {renewing ? 'Re-posting…' : 'Renew — re-post to vendors'}
                </button>
              )}
              <button type="button" className="secondary" onClick={remove} style={compactBtnStyle}>
                Delete
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </li>
  );
}

export default function MyRequests({ socket, onViewOffers, onViewOrder, onReorder }) {
  const [requests, setRequests] = useState(null); // null = still loading
  const [visibleCount, setVisibleCount] = useState(3);
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  function load() {
    api
      .get('/requests/me')
      .then(({ data }) => setRequests(data))
      .catch(() => setRequests([]));
  }

  useEffect(() => {
    load();
  }, []);

  // Backend pushes 'myrequests:updated' whenever anything relevant happens
  // to any of this user's requests - a new offer arrives, one gets
  // accepted, or an order's status changes. Refetching the whole list on
  // that signal is simpler and more robust than trying to patch individual
  // fields from a partial event payload, and this list is small enough that
  // the extra request is negligible.
  useEffect(() => {
    if (!socket) return;
    socket.on('myrequests:updated', load);
    return () => socket.off('myrequests:updated', load);
  }, [socket]);

  // If a relevant event fired while the phone was locked/backgrounded, the
  // socket was disconnected and never received it - reconnecting afterward
  // doesn't replay missed events. Refetching on foreground return catches
  // anything that slipped through that gap.
  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState === 'visible') load();
    }
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, []);

  if (requests === null) return null;
  if (!requests.length) return null;

  const visible = requests.slice(0, visibleCount);
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selectedIds.has(r.id));

  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visible.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      visible.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function handleChanged(updated) {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handleDeleted(id) {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (!selectedIds.size) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected request${selectedIds.size > 1 ? 's' : ''}? This can't be undone.`)) {
      return;
    }
    const ids = [...selectedIds];
    const failures = [];
    for (const id of ids) {
      try {
        await api.delete(`/requests/${id}`);
      } catch (err) {
        failures.push(err.response?.data?.error || 'Failed to delete one request');
      }
    }
    setRequests((prev) => prev.filter((r) => !ids.includes(r.id) || failures.length));
    // Refetch to get an accurate list if anything failed (e.g. had an order on it)
    if (failures.length) {
      alert(`${failures.length} request(s) couldn't be deleted (likely already has an order on them).`);
      const { data } = await api.get('/requests/me');
      setRequests(data);
    }
    setSelectedIds(new Set());
  }

  return (
    <div className="panel" style={{ marginTop: 12, marginBottom: 16 }}>
      <div className="alert-main">
        <h2 style={{ margin: 0, color: 'var(--clay)', fontSize: '1.1rem', fontWeight: 800 }}>My requests</h2>
        {selectedIds.size > 0 && (
          <button type="button" className="secondary" onClick={deleteSelected}>
            Delete {selectedIds.size} selected
          </button>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
        <span className="hint">Select all shown</span>
      </label>

      <ul className="order-list">
        {visible.map((r) => (
          <RequestCard
            key={r.id}
            r={r}
            checked={selectedIds.has(r.id)}
            onCheckToggle={() => toggleOne(r.id)}
            onChanged={handleChanged}
            onDeleted={handleDeleted}
            onViewOffers={onViewOffers}
            onViewOrder={onViewOrder}
            onReorder={onReorder}
          />
        ))}
      </ul>

      {requests.length > 3 && (
        <div className="category-accordion" style={{ marginTop: 8 }}>
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
