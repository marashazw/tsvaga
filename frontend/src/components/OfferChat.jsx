import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const MAX_SOURCE_FILE_BYTES = 12 * 1024 * 1024; // 12MB - generous, since this is BEFORE compression
const MAX_DIMENSION = 1000; // longest side, in px
const JPEG_QUALITY = 0.7;

// Resizes and compresses an image client-side via canvas before sending -
// a raw phone photo can easily be several MB, far too large to store as a
// base64 data URL in a text column efficiently. This keeps typical photos
// well under a few hundred KB while staying clearly legible in a chat.
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // A transparent PNG would otherwise render as black once flattened
        // to JPEG (which has no alpha channel) - white is the sensible
        // default background for a photo shared in chat.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.onerror = () => reject(new Error('Could not read that image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

export default function OfferChat({ offerId, socket, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [imagePreview, setImagePreview] = useState(null); // resized data URL, ready to send
  const [imageProcessing, setImageProcessing] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/offers/${offerId}/messages`)
      .then(({ data }) => {
        if (!cancelled) setMessages(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  useEffect(() => {
    if (!socket) return;
    function onMessage(msg) {
      if (msg.offer_id !== offerId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    }
    socket.on('offer:message', onMessage);
    return () => socket.off('offer:message', onMessage);
  }, [socket, offerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  async function handleImageSelect(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setError('That image is too large (max 12MB).');
      return;
    }

    setImageProcessing(true);
    try {
      const dataUrl = await resizeImage(file);
      setImagePreview(dataUrl);
    } catch (err) {
      setError(err.message || 'Failed to process that image');
    } finally {
      setImageProcessing(false);
    }
  }

  async function send(e) {
    e.preventDefault();
    if (!text.trim() && !imagePreview) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/offers/${offerId}/messages`, {
        body: text.trim() || undefined,
        image_data: imagePreview || undefined,
      });
      setText('');
      setImagePreview(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="offer-chat">
      <div className="offer-chat-messages">
        {loading ? (
          <p className="hint">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="hint">No messages yet — ask a question or make a counter-offer.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.sender_id === currentUserId ? 'mine' : 'theirs'}`}>
              {m.image_data ? (
                <img
                  src={m.image_data}
                  alt="Shared in chat"
                  style={{ maxWidth: 240, width: '100%', borderRadius: 8, display: 'block' }}
                />
              ) : !m.body ? (
                // No body AND no image only happens once an image-only
                // message's photo has expired and been cleared - the
                // backend only ever accepts a message with at least one of
                // the two present.
                <p className="hint" style={{ fontStyle: 'italic', margin: 0 }}>
                  📷 Photo (no longer available)
                </p>
              ) : null}
              {m.body && <p style={{ marginTop: m.image_data ? 6 : 0 }}>{m.body}</p>}
              <span className="chat-time">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {imagePreview && (
        <div style={{ position: 'relative', display: 'inline-block', margin: '0 0 8px' }}>
          <img src={imagePreview} alt="Selected" style={{ maxHeight: 100, borderRadius: 8, display: 'block' }} />
          <button
            type="button"
            onClick={() => setImagePreview(null)}
            aria-label="Remove image"
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--clay)',
              color: 'white',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={send} className="offer-chat-form">
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            background: '#fff',
            border: '1px solid #e7ddc9',
            borderRadius: 20,
            padding: '2px 4px 2px 14px',
          }}
        >
          <input
            type="text"
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              padding: '8px 4px',
              outline: 'none',
              minWidth: 0,
            }}
          />

          {/* No capture attribute - opens the device's normal file/gallery picker. */}
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={imageProcessing}
            title="Attach a photo"
            style={{
              border: 'none',
              background: 'transparent',
              padding: '4px 6px',
              fontSize: '1.2rem',
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            {imageProcessing ? '…' : '📎'}
          </button>

          {/* capture="environment" opens the rear camera directly, bypassing
              the file/gallery chooser entirely. */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraInputRef}
            onChange={handleImageSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={imageProcessing}
            title="Take a photo"
            style={{
              border: 'none',
              background: 'transparent',
              padding: '4px 6px',
              fontSize: '1.2rem',
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            {imageProcessing ? '…' : '📷'}
          </button>
        </div>

        <button type="submit" disabled={sending || (!text.trim() && !imagePreview)}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
