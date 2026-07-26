// Registers the service worker on every page load, regardless of whether the
// person ever clicks "Enable notifications". This is separate from push
// subscription logic (in push.js) - having an active service worker
// controlling the page is one of the browser's requirements for the app to
// be considered "installable" (Add to Home Screen / install icon), even for
// people who never turn on push notifications at all.
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  }
}
