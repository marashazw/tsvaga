import { api } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Registers the service worker, subscribes to push, and saves the
// subscription against the signed-in vendor. Returns 'granted' | 'denied' |
// 'unsupported' | 'not-configured'.
//
// Deliberately does NOT call Notification.requestPermission() separately -
// pushManager.subscribe() below triggers the permission prompt itself when
// needed. Calling both APIs in sequence is a known cause of the exact same
// prompt appearing twice on some Android browsers, since subscribe() can
// independently decide to request permission again if it doesn't see the
// prior grant as fully settled yet. Using subscribe() alone avoids that.
export async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }

  const { data } = await api.get('/push/public-key');
  if (!data.enabled || !data.publicKey) {
    return 'not-configured';
  }

  const registration = await navigator.serviceWorker.register('/service-worker.js');

  let subscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });
  } catch (err) {
    // The person declined (or it's already blocked at the browser level) -
    // anything else is a genuine, unexpected failure worth surfacing.
    if (Notification.permission === 'denied') return 'denied';
    throw err;
  }

  await api.post('/users/me/push-subscription', subscription.toJSON());
  return 'granted';
}

// Checks whether push is ALREADY enabled from a previous visit, so the app
// doesn't ask again every time someone opens it. Returns 'granted',
// 'denied', 'unsupported', or null (genuinely undecided - show the button).
export async function checkExistingPushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? 'granted' : null;
  } catch {
    return null;
  }
}
