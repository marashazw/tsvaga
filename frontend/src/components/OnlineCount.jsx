import React, { useEffect, useState } from 'react';

export default function OnlineCount({ socket }) {
  const [count, setCount] = useState(20);

  useEffect(() => {
    if (!socket) return;
    function onCount(payload) {
      setCount(payload.count);
    }
    socket.on('presence:count', onCount);
    return () => socket.off('presence:count', onCount);
  }, [socket]);

  return (
    <span className="online-count">
      🟢 {count} {count === 1 ? 'person' : 'people'} online now
    </span>
  );
}
