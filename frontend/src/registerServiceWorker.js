import { Capacitor } from '@capacitor/core';

// Registers the service worker on every page load, regardless of whether the
// person ever clicks "Enable notifications". This is separate from push
// subscription logic (in push.js) - having an active service worker
// controlling the page is one of the browser's requirements for the app to
// be considered "installable" (Add to Home Screen / install icon), even for
// people who never turn on push notifications at all.
//
// Skipped entirely inside the native Capacitor app: "installable" is
// meaningless there (it's already installed as a real app), push goes
// through FCM via the native plugin instead of a service worker at all, and
// Capacitor's Android WebView has known, documented trouble registering
// service workers cleanly against its local asset server - attempting it
// there just produces a scary, confusing error with no actual benefit.
export function registerServiceWorker() {
  if (Capacitor.isNativePlatform()) return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  }
}
