import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';

export default function OfferChat({ offerId, socket, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

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

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/offers/${offerId}/messages`, { body: text.trim() });
      setText('');
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
              <p>{m.body}</p>
              <span className="chat-time">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="offer-chat-form">
        <input
          type="text"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
