import React, { useEffect, useRef, useState } from 'react';
import OfferChat from './OfferChat.jsx';
import { playNotificationSound } from '../notificationSound.js';

export default function ChatToggleButton({ offerId, socket, currentUserId, label }) {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  // A ref mirrors `open` so the socket listener (set up once) always reads
  // the current value, rather than the stale one from whenever it was attached.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!socket || !offerId) return;
    console.log('[chat-diag] listener attached, offerId:', offerId, 'currentUserId:', currentUserId, 'socket connected:', socket.connected);
    function onMessage(msg) {
      console.log('[chat-diag] offer:message received:', msg, 'watching offerId:', offerId, 'open:', openRef.current);
      if (msg.offer_id !== offerId) {
        console.log('[chat-diag] IGNORED - offer_id mismatch');
        return;
      }
      if (msg.sender_id === currentUserId) {
        console.log('[chat-diag] IGNORED - own message');
        return; // don't flag our own messages
      }
      if (!openRef.current) {
        console.log('[chat-diag] FLAGGING as unread');
        setHasUnread(true);
        playNotificationSound();
      }
    }
    socket.on('offer:message', onMessage);
    return () => socket.off('offer:message', onMessage);
  }, [socket, offerId, currentUserId]);

  function toggle() {
    setOpen((o) => !o);
    setHasUnread(false);
  }

  if (!offerId) return null;

  return (
    <div>
      <button className={`link-btn ${hasUnread ? 'chat-flash' : ''}`} type="button" onClick={toggle}>
        {open ? 'Hide chat' : hasUnread ? '🔴 New message' : `💬 ${label}`}
      </button>
      {open && <OfferChat offerId={offerId} socket={socket} currentUserId={currentUserId} />}
    </div>
  );
}
