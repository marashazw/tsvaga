const webpush = require('web-push');

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL } = process.env;

const isConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isConfigured) {
  webpush.setVapidDetails(VAPID_CONTACT_EMAIL || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('VAPID keys not set - push notifications are disabled. Run `npm run generate:vapid` and add them to .env.');
}

module.exports = { webpush, isConfigured };
