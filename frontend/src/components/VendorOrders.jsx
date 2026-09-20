import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import ChatToggleButton from './ChatToggleButton.jsx';

function statusLabel(order) {
  const pickup = order.fulfillment_type === 'pickup';
  return {
    confirmed: 'Confirmed — preparing',
    out_for_delivery: pickup ? 'Ready for pickup' : 'Out for delivery',
    delivered: pickup ? 'Picked up' : 'Delivered',
    cancelled: 'Cancelled',
  }[order.status] || order.status;
}

function nextAction(order) {
  const pickup = order.fulfillment_type === 'pickup';
  return {
    confirmed: { status: 'out_for_delivery', label: pickup ? 'Mark ready for pickup' : 'Mark out for delivery' },
    out_for_delivery: { status: 'delivered', label: pickup ? 'Mark picked up' : 'Mark delivered' },
  }[order.status];
}

function OrderCard({ order: o, onAdvance, socket, currentUserId, isHighlighted, autoOpenChat }) {
  // While THIS order is an actual delivery (not a pickup, where there's no
  // "vendor traveling to you" scenario) and is out for delivery, watch this
  // device's GPS and report it to the backend so the requester can see
  // live movement. Throttled to avoid hammering the API on every tiny GPS
  // update - a delivery in progress doesn't need sub-second precision, a
  // position every several seconds is plenty for someone watching a map.
  const lastSentAt = useRef(0);
  useEffect(() => {
    const isActiveDelivery = o.status === 'out_for_delivery' && o.fulfillment_type !== 'pickup';
    if (!isActiveDelivery || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentAt.current < 8000) return; // throttle to ~once per 8s
        lastSentAt.current = now;
        api
          .patch(`/orders/${o.id}/location`, { lat: pos.coords.latitude, lng: pos.coords.longitude })
          .catch(() => {}); // a single missed ping isn't worth surfacing an error for
      },
      () => {}, // silently ignore GPS errors here - not worth interrupting the vendor's flow
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [o.id, o.status, o.fulfillment_type]);

  return (
    <li
      id={`order-card-${o.id}`}
      className="order-card"
      style={
        isHighlighted
          ? { outline: '3px solid var(--clay)', outlineOffset: 2, transition: 'outline-color 2s ease' }
          : undefined
      }
    >
      <div className="alert-main">
        <strong>{o.product_text}</strong>
        <span className="price">
          ${(Number(o.price) + Number(o.delivery_fee || 0)).toFixed(2)}
        </span>
      </div>
      {Array.isArray(o.cart_prices) && o.cart_prices.length > 0 ? (
        <div style={{ margin: '2px 0' }}>
          {o.cart_prices.map((cp, i) => (
            <p key={i} className="hint" style={{ margin: '1px 0' }}>
              {cp.product_text}: ${Number(cp.price).toFixed(2)}
            </p>
          ))}
          {Number(o.delivery_fee || 0) > 0 && (
            <p className="hint" style={{ margin: '1px 0' }}>Delivery: ${Number(o.delivery_fee).toFixed(2)}</p>
          )}
        </div>
      ) : (
        Number(o.delivery_fee || 0) > 0 && (
          <p className="hint" style={{ margin: '2px 0 0' }}>
            Item: ${Number(o.price).toFixed(2)} + Delivery: ${Number(o.delivery_fee).toFixed(2)}
          </p>
        )
      )}
      <p className="hint">
        {o.fulfillment_type === 'pickup'
          ? o.request_type === 'service'
            ? '🚶 Customer will come to you'
            : '🚶 Customer will collect'
          : o.request_type === 'service'
            ? `🔧 Provide service at: ${o.delivery_address_text || o.request_address || 'their pinned location'}`
            : `🚚 Deliver to: ${o.delivery_address_text || o.request_address || 'their pinned location'}`}
      </p>
      <p className="hint">
        📞 {o.recipient_name || 'Contact'}: {o.recipient_phone || o.requester_phone}
      </p>
      <span className={`badge status-${o.status}`}>{statusLabel(o)}</span>
      {nextAction(o) && (
        <button onClick={() => onAdvance(o)} style={{ marginLeft: 10 }}>
          {nextAction(o).label}
        </button>
      )}
      {o.status === 'out_for_delivery' && o.fulfillment_type !== 'pickup' && (
        <div style={{ marginTop: 6 }}>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `Hi, please open this link and tap "Start sharing" so the customer can track this delivery live: https://tsvaga.app/driver-track.html?order=${o.id}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="link-btn"
          >
            📢 Send tracking link to driver
          </a>
          <span className="hint" style={{ display: 'block', marginTop: 2 }}>
            If you're the one delivering yourself, this device is already sharing your location automatically.
          </span>
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        <ChatToggleButton
          offerId={o.offer_id}
          socket={socket}
          currentUserId={currentUserId}
          label="Message customer"
          autoOpen={autoOpenChat}
        />
      </div>
    </li>
  );
}

export default function VendorOrders({ orders, onUpdated, socket, currentUserId, highlightOrderId, autoOpenChatOrderId }) {
  const [showCompleted, setShowCompleted] = useState(false);

  // Arriving here via a notification for a specific order - if that order
  // only shows up under "completed" (already delivered), that section
  // needs to actually be expanded first, otherwise the order is there but
  // invisible and scrolling to it would do nothing.
  useEffect(() => {
    if (!highlightOrderId) return;
    const isCompleted = orders.some((o) => o.id === highlightOrderId && o.status === 'delivered');
    if (isCompleted) setShowCompleted(true);
  }, [highlightOrderId, orders]);

  useEffect(() => {
    if (!highlightOrderId) return;
    const el = document.getElementById(`order-card-${highlightOrderId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightOrderId, showCompleted, orders]);

  async function advance(order) {
    const next = nextAction(order);
    if (!next) return;
    const { data } = await api.patch(`/orders/${order.id}/status`, { status: next.status });
    onUpdated(data);
  }

  if (!orders.length) {
    return <p className="hint">No active orders yet — accepted offers will show up here.</p>;
  }

  const activeOrders = orders.filter((o) => o.status === 'confirmed' || o.status === 'out_for_delivery');
  const completedOrders = orders.filter((o) => o.status === 'delivered');

  return (
    <div>
      {activeOrders.length === 0 ? (
        <p className="hint">Nothing to fulfil right now.</p>
      ) : (
        <ul className="order-list">
          {activeOrders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onAdvance={advance}
              socket={socket}
              currentUserId={currentUserId}
              isHighlighted={o.id === highlightOrderId}
              autoOpenChat={o.id === autoOpenChatOrderId}
            />
          ))}
        </ul>
      )}

      {completedOrders.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="link-btn" type="button" onClick={() => setShowCompleted((s) => !s)}>
            {showCompleted ? 'Hide' : 'Show'} completed orders ({completedOrders.length})
          </button>
          {showCompleted && (
            <ul className="order-list" style={{ marginTop: 8 }}>
              {completedOrders.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onAdvance={advance}
                  socket={socket}
                  currentUserId={currentUserId}
                  isHighlighted={o.id === highlightOrderId}
                  autoOpenChat={o.id === autoOpenChatOrderId}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
