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
// If enablePushNotifications() returns 'error', call this right after to
// get the actual underlying error message - kept separate from the main
// return value so every existing `pushStatus === 'granted'` style check
// throughout the app keeps working unchanged (a string, not an object).
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

    await api.post('/users/me/push-subscription', subscription.toJSON());
    return 'granted';
  } catch (err) {
    console.error('Failed to enable push notifications:', err);
    // Only report "denied" if the browser's own permission state genuinely
    // says so - anything else (a bad VAPID key, a network hiccup, a
    // subscribe() failure unrelated to permission) is a real technical
    // error, not the person having blocked notifications. Mislabeling it as
    // "denied" sends people to check browser settings that are already
    // correctly set, which is exactly what was happening here.
    if (Notification.permission === 'denied') return 'denied';
    lastPushErrorMessage = err?.message || String(err);
    return 'error';
  }
}

// Checks whether push is ALREADY enabled from a previous visit, so the app
// doesn't ask again every time someone opens it. Returns 'granted',
// 'denied', 'unsupported', or null (genuinely undecided - show the button).
//
// Deliberately checks ONLY Notification.permission, not the actual
// PushManager subscription - looking up the subscription requires waiting
// on navigator.serviceWorker.ready, which on a plain page refresh may not
// have finished re-activating yet, causing this check to wrongly report "no
// subscription" even though one genuinely exists (this was the actual cause
// of the button reappearing specifically on refresh, but not on a full app
// close/reopen where the service worker had more time to settle).
// Notification.permission itself is a plain, synchronous browser property -
// no such race condition possible.
export async function checkExistingPushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return null;
}
