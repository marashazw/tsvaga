import { api } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Registers the service worker, asks for notification permission, subscribes
// to push, and saves the subscription against the signed-in vendor.
// Returns 'granted' | 'denied' | 'unsupported' | 'not-configured'.
export async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }

  const { data } = await api.get('/push/public-key');
  if (!data.enabled || !data.publicKey) {
    return 'not-configured';
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.register('/service-worker.js');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });

  await api.post('/vendors/me/push-subscription', subscription.toJSON());
  return 'granted';
}
