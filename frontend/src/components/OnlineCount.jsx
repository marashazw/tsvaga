import React, { useEffect, useState } from 'react';

export default function OnlineCount({ socket }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!socket) return;
    function onCount(payload) {
      setCount(payload.count);
    }
    socket.on('presence:count', onCount);
    return () => socket.off('presence:count', onCount);
  }, [socket]);

  if (count === null || count < 8) return null;

  return (
    <span className="online-count">
      🟢 {count} people online now
    </span>
  );
}
