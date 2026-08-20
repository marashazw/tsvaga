import React from 'react';

export default function VendorTodoList({ orders }) {
  const pending = orders.filter((o) => o.status === 'confirmed' || o.status === 'out_for_delivery');
  if (!pending.length) return null;

  return (
    <div className="vendor-todo-sticky">
      <a href="#section-orders">
        📋 {pending.length} order{pending.length > 1 ? 's' : ''} awaiting fulfilment — tap to view →
      </a>
    </div>
  );
}
