import { jsPDF } from 'jspdf';
import { api } from './api';

function formatEta(minutes) {
  if (!minutes) return null;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
  }
  return `${minutes} min`;
}

// Fetches the full chat transcript for this order's offer, then builds a
// PDF with the order summary followed by the full conversation, and
// triggers a download. Deliberately fetches fresh here rather than relying
// on whatever OrderTracker/OfferChat happen to have in memory - the chat
// panel might not even be open when this is clicked, and a saved record
// should always be complete regardless of what's currently rendered.
export async function exportOrderAsPdf(order, currentUserId) {
  let messages = [];
  if (order.offer_id) {
    try {
      const { data } = await api.get(`/offers/${order.offer_id}/messages`);
      messages = data;
    } catch (err) {
      console.error('Failed to fetch messages for PDF export:', err);
    }
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  let y = 56;

  function ensureSpace(neededHeight) {
    if (y + neededHeight > pageHeight - 48) {
      doc.addPage();
      y = 56;
    }
  }

  function heading(text, size = 16) {
    ensureSpace(size + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor('#2f6f4f');
    doc.text(text, marginX, y);
    y += size + 8;
    doc.setTextColor('#000000');
  }

  function line(label, value) {
    if (value === null || value === undefined || value === '') return;
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${label}:`, marginX, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(String(value), usableWidth - 110);
    doc.text(wrapped, marginX + 110, y);
    y += Math.max(14, wrapped.length * 12);
  }

  // --- Header ---
  heading('Tsvaga — Order Record', 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#7a6f5c');
  doc.text(`Generated ${new Date().toLocaleString()}`, marginX, y);
  y += 20;
  doc.setTextColor('#000000');

  // --- Order summary ---
  heading('Order Details', 13);
  line('Item', order.product_text);
  if (order.quantity) line('Quantity', order.quantity);
  line('Vendor', order.business_name);
  if (Array.isArray(order.cart_prices) && order.cart_prices.length > 0) {
    order.cart_prices.forEach((cp) => {
      line(`  • ${cp.product_text}`, `$${Number(cp.price).toFixed(2)}`);
    });
  }
  const total = Number(order.price || 0) + Number(order.delivery_fee || 0);
  line(
    'Price',
    Number(order.delivery_fee || 0) > 0
      ? `$${Number(order.price).toFixed(2)} + $${Number(order.delivery_fee).toFixed(2)} delivery = $${total.toFixed(2)}`
      : `$${Number(order.price || 0).toFixed(2)}`
  );
  const eta = formatEta(order.delivery_eta_minutes);
  if (eta) line('ETA at time of order', eta);
  line('Fulfilment', order.fulfillment_type === 'pickup' ? 'Collection / self pickup' : 'Delivery');
  line('Location', order.delivery_address_text || order.request_address || 'Pinned map location');
  line('Status', order.status);
  line('Order placed', order.created_at ? new Date(order.created_at).toLocaleString() : null);
  if (order.delivered_at) line('Delivered', new Date(order.delivered_at).toLocaleString());
  y += 10;

  // --- Conversation ---
  heading('Conversation', 13);
  if (!messages.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor('#7a6f5c');
    ensureSpace(16);
    doc.text('No messages were exchanged for this order.', marginX, y);
    y += 16;
    doc.setTextColor('#000000');
  } else {
    messages.forEach((m) => {
      const isMine = m.sender_id === currentUserId;
      const senderLabel = isMine ? 'You' : order.business_name || 'Vendor';
      const timestamp = new Date(m.created_at).toLocaleString();
      const wrapped = doc.splitTextToSize(m.body, usableWidth - 20);
      ensureSpace(wrapped.length * 12 + 20);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(isMine ? '#b5562f' : '#2f6f4f');
      doc.text(`${senderLabel}  ·  ${timestamp}`, marginX, y);
      y += 12;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor('#000000');
      doc.text(wrapped, marginX + 10, y);
      y += wrapped.length * 12 + 8;
    });
  }

  doc.save(`tsvaga-order-${order.id || order.offer_id || 'record'}.pdf`);
}
