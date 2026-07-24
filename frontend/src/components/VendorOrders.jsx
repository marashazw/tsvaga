import React from 'react';
import { api } from '../api';

const STATUS_LABEL = {
  confirmed: 'Confirmed — preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const NEXT_ACTION = {
  confirmed: { status: 'out_for_delivery', label: 'Mark out for delivery' },
  out_for_delivery: { status: 'delivered', label: 'Mark delivered' },
};

export default function VendorOrders({ orders, onUpdated }) {
  async function advance(order) {
    const next = NEXT_ACTION[order.status];
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
            <span className="price">${Number(o.price).toFixed(2)}</span>
          </div>
          <p className="hint">{o.request_address}</p>
          <span className={`badge status-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
          {NEXT_ACTION[o.status] && (
            <button onClick={() => advance(o)} style={{ marginLeft: 10 }}>
              {NEXT_ACTION[o.status].label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
