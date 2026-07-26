// Minimal service worker: just enough to receive Web Push events and show a
// notification, even when no Tsvaga tab is open. No caching/offline-app logic
// here on purpose - keep it focused on the one job it has.

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
      icon: '/icon.png',
      badge: '/icon.png',
      data: { request_id: data.request_id || null },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/vendor.html') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/vendor.html');
    })
  );
});
