// Minimal service worker: receives Web Push events and shows a notification
// even when no Tsvaga tab is open, and includes a pass-through fetch handler
// (required by Chrome/Android for the app to be considered "installable" -
// no caching/offline logic here on purpose, every request just goes to the
// network as normal).

self.addEventListener('fetch', () => {
  // Intentionally a no-op passthrough - having a fetch handler registered at
  // all is what satisfies installability checks; we don't intercept or cache
  // anything here.
});

self.addEventListener('push', (event) => {
  let data = { title: 'Tsvaga', body: 'You have a new alert.' };
  try {
    data = event.data.json();
  } catch (err) {
    // fall back to default text above if the payload wasn't JSON
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tsvaga', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { request_id: data.request_id || null, order_id: data.order_id || null, url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
