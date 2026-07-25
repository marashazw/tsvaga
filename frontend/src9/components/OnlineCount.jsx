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

  if (count === null) return null;

  return (
    <span className="online-count">
      🟢 {count} {count === 1 ? 'person' : 'people'} online now
    </span>
  );
}
