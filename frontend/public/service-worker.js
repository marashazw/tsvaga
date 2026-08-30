const ICON_URL = '/icon-192.png';
const BADGE_URL = '/icons/512x512-monochrome.png';

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let data = { title: 'Tsvaga', body: 'You have a new alert.' };
  
  if (event.data) {
    try {
      // Parse JSON payload (standard for your backend)
      data = event.data.json();
    } catch (err) {
      // Fallback to plain text (standard for Firebase Console tests)
      data = { title: 'Tsvaga', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || '',
    icon: data.icon || ICON_URL,
    badge: data.badge || BADGE_URL,
    data: {
      url: data.url || '/',
      request_id: data.request_id || null,
      order_id: data.order_id || null,
    },
    tag: data.tag || 'tsvaga-general',
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tsvaga', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('tsvaga.app') && 'focus' in client) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(new URL(targetUrl, self.location.origin).href);
      }
    })
  );
});
