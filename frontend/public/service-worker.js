// Minimal service worker for Tsvaga PWA
// Handles Web Push + keeps app installable

const ICON_URL = 'https://tsvaga.app/icon-192.png';
const BADGE_URL = 'https://tsvaga.app/icons/512x512-monochrome.png'; // must be white + transparent

// 1. Pass-through fetch - required for installability on Chrome/Android.
// Just go to network, don't cache anything.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// 2. Handle incoming push
self.addEventListener('push', (event) => {
  let data = { title: 'Tsvaga', body: 'You have a new alert.' };
  try {
    data = event.data.json();
  } catch (err) {
    console.error('Push payload not JSON:', err);
  }

  const options = {
    body: data.body || '',
    icon: data.icon || ICON_URL, // big color icon
    badge: data.badge || BADGE_URL, // small monochrome in status bar
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

// 3. Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If Tsvaga is already open, focus that tab and navigate it
      for (const client of windowClients) {
        if (client.url.includes('tsvaga.app') && 'focus' in client) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(new URL(targetUrl, 'https://tsvaga.app').href);
      }
    })
  );
});
