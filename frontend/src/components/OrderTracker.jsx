import React, { useEffect, useState } from 'react';
import ReviewForm from './ReviewForm.jsx';
import ChatToggleButton from './ChatToggleButton.jsx';
import DeliveryTrackingMap from './DeliveryTrackingMap.jsx';
import { exportOrderAsPdf } from '../pdfExport.js';

function formatEta(minutes) {
  if (!minutes) return null;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
  }
  return `${minutes} min`;
}

const STEPS_DELIVERY = [
  { key: 'confirmed', label: 'Order confirmed' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const STEPS_PICKUP = [
  { key: 'confirmed', label: 'Order confirmed' },
  { key: 'out_for_delivery', label: 'Ready for pickup' },
  { key: 'delivered', label: 'Picked up' },
];

export default function OrderTracker({ order, socket, currentUserId }) {
  const [review, setReview] = useState(
    order.review_id ? { rating: order.review_rating, comment: order.review_comment } : null
  );
  const [exporting, setExporting] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [vendorPos, setVendorPos] = useState(
    order.current_lat != null && order.current_lng != null
      ? { lat: order.current_lat, lng: order.current_lng }
      : null
  );

  // Live position updates arrive on the same request room OrderTracker
  // already listens on for order:status - only relevant while this
  // specific order's tracking is actually being shown.
  useEffect(() => {
    if (!socket) return;
    function handleLocation(payload) {
      if (payload.order_id !== order.id) return;
      setVendorPos({ lat: payload.lat, lng: payload.lng });
    }
    socket.on('order:location', handleLocation);
    return () => socket.off('order:location', handleLocation);
  }, [socket, order.id]);

  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportOrderAsPdf(order, currentUserId);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  if (!order) return null;
  const isPickup = order.fulfillment_type === 'pickup';
  const steps = isPickup ? STEPS_PICKUP : STEPS_DELIVERY;
  const currentIndex = steps.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === 'cancelled';
  const isDelivered = order.status === 'delivered';

  return (
    <div className="order-tracker">
      <h3 style={{ marginTop: 0 }}>{order.business_name}</h3>
      {Array.isArray(order.cart_prices) && order.cart_prices.length > 0 ? (
        <div style={{ margin: '4px 0' }}>
          {order.cart_prices.map((cp, i) => (
            <p key={i} className="hint" style={{ margin: '1px 0' }}>
              {cp.product_text}: ${Number(cp.price).toFixed(2)}
            </p>
          ))}
          <p className="hint" style={{ margin: '4px 0', fontWeight: 600 }}>
            Total: ${(Number(order.price) + Number(order.delivery_fee || 0)).toFixed(2)}
            {Number(order.delivery_fee || 0) > 0 && ` (incl. $${Number(order.delivery_fee).toFixed(2)} delivery)`}
            {formatEta(order.delivery_eta_minutes) && ` · ${formatEta(order.delivery_eta_minutes)} ETA`}
          </p>
        </div>
      ) : (
        <p className="hint">
          {order.product_text} ·{' '}
          {Number(order.delivery_fee || 0) > 0
            ? `$${Number(order.price).toFixed(2)} + $${Number(order.delivery_fee).toFixed(2)} delivery = $${(Number(order.price) + Number(order.delivery_fee)).toFixed(2)}`
            : `$${Number(order.price).toFixed(2)}`}
          {formatEta(order.delivery_eta_minutes) && <> · {formatEta(order.delivery_eta_minutes)} ETA</>}
        </p>
      )}
      <p className="hint">
        {isPickup
          ? order.request_type === 'service'
            ? "You'll go to them."
            : "You'll collect this yourself."
          : order.delivery_address_text
            ? `${order.request_type === 'service' ? 'Service provided at' : 'Deliver to'}: ${order.delivery_address_text}`
            : order.request_type === 'service'
              ? 'Service provided at your pinned location.'
              : 'Deliver to your pinned location.'}
      </p>

      {isCancelled ? (
        <p className="badge status-cancelled">Order cancelled</p>
      ) : (
        <ol className="tracker-steps">
          {steps.map((step, i) => (
            <li key={step.key} className={i <= currentIndex ? 'done' : ''}>
              <span className="dot" />
              {step.label}
            </li>
          ))}
        </ol>
      )}

      {order.status === 'out_for_delivery' && !isPickup && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="secondary" onClick={() => setShowTracking((s) => !s)}>
            {showTracking ? '▲ Hide live tracking' : '📍 Track delivery'}
          </button>
          {showTracking && (
            <div style={{ marginTop: 8 }}>
              <DeliveryTrackingMap
                vendorPos={vendorPos}
                destPos={order.dest_lat != null && order.dest_lng != null ? { lat: order.dest_lat, lng: order.dest_lng } : null}
                vendorLabel={order.business_name}
              />
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {order.offer_id && (
          <ChatToggleButton
            offerId={order.offer_id}
            socket={socket}
            currentUserId={currentUserId}
            label={`Message ${order.business_name}`}
          />
        )}
        <button type="button" className="secondary" disabled={exporting} onClick={handleExportPdf}>
          {exporting ? 'Preparing PDF…' : '📄 Save as PDF'}
        </button>
      </div>

      {isDelivered && (
        <div style={{ marginTop: 16 }}>
          {review ? (
            <div className="review-summary">
              <span className="star-display">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
              {review.comment && <p className="hint">"{review.comment}"</p>}
              <p className="hint">Thanks for the feedback!</p>
            </div>
          ) : (
            <ReviewForm orderId={order.id} onSubmitted={setReview} />
          )}
        </div>
      )}
    </div>
  );
}
