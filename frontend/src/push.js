import { api } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

let lastPushErrorMessage = null;
export function getLastPushErrorMessage() {
  return lastPushErrorMessage;
}

export async function enablePushNotifications() {
  lastPushErrorMessage = null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }

  try {
    const { data } = await api.get('/push/public-key');
    if (!data.enabled || !data.publicKey) {
      return 'not-configured';
    }

    const registration = await navigator.serviceWorker.register('/service-worker.js');

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });

    // 📍 TEMPORARY LOG FOR GRABBING NATIVE TOKENS:
    console.log("MOBILE_SUBSCRIPTION_TOKEN_JSON:", JSON.stringify(subscription.toJSON()));

    await api.post('/users/me/push-subscription', subscription.toJSON());
    return 'granted';
  } catch (err) {
    console.error('Failed to enable push notifications:', err);
    if (Notification.permission === 'denied') return 'denied';
    lastPushErrorMessage = err?.message || String(err);
    return 'error';
  }
}

export async function checkExistingPushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return null;
}
