import React from 'react';
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

export default function VendorOrders({ orders, onUpdated, socket, currentUserId }) {
  async function advance(order) {
    const next = nextAction(order);
    if (!next) return;
    const { data } = await api.patch(`/orders/${order.id}/status`, { status: next.status });
    onUpdated(data);
  }

  if (!orders.length) {
    return <p className="hint">No active orders yet — accepted offers will show up here.</p>;
  }

  return (
    <ul className="order-list">
      {orders.map((o) => (
        <li key={o.id} className="order-card">
          <div className="alert-main">
            <strong>{o.product_text}</strong>
            <span className="price">
              ${(Number(o.price) + Number(o.delivery_fee || 0)).toFixed(2)}
            </span>
          </div>
          {Number(o.delivery_fee || 0) > 0 && (
            <p className="hint" style={{ margin: '2px 0 0' }}>
              Item: ${Number(o.price).toFixed(2)} + Delivery: ${Number(o.delivery_fee).toFixed(2)}
            </p>
          )}
          <p className="hint">
            {o.fulfillment_type === 'pickup'
              ? '🚶 Customer will collect'
              : o.delivery_address_text
                ? `🚚 Deliver to: ${o.delivery_address_text}`
                : `🚚 Deliver to: ${o.request_address || 'their pinned location'}`}
          </p>
          <p className="hint">
            📞 {o.recipient_name || 'Contact'}: {o.recipient_phone || o.requester_phone}
          </p>
          <span className={`badge status-${o.status}`}>{statusLabel(o)}</span>
          {nextAction(o) && (
            <button onClick={() => advance(o)} style={{ marginLeft: 10 }}>
              {nextAction(o).label}
            </button>
          )}
          <div style={{ marginTop: 6 }}>
            <ChatToggleButton offerId={o.offer_id} socket={socket} currentUserId={currentUserId} label="Message customer" />
          </div>
        </li>
      ))}
    </ul>
  );
}
