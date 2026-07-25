const pool = require('../config/db');
const { webpush, isConfigured } = require('../config/push');

// Sends a push notification to all of a vendor's registered devices/browsers.
// This is what reaches a vendor even if their dashboard tab/app is closed -
// as long as the browser has the service worker registered, the OS delivers
// the notification. Socket.io alerts (in requests.js) only reach an *open* tab;
// push is the fallback for "online for business, but not staring at the screen".
async function notifyVendorsByPush(vendorIds, payload) {
  if (!isConfigured || !vendorIds.length) return;

  const { rows: subscriptions } = await pool.query(
    `SELECT id, vendor_id, endpoint, p256dh, auth FROM vendor_push_subscriptions WHERE vendor_id = ANY($1)`,
    [vendorIds]
  );

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(pushSubscription, body);
      } catch (err) {
        // 404/410 means the subscription is dead (browser data cleared, permission
        // revoked, etc.) - remove it so we stop wasting sends on it.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query('DELETE FROM vendor_push_subscriptions WHERE id = $1', [sub.id]);
        } else {
          console.error('Push send failed for subscription', sub.id, err.message);
        }
      }
    })
  );
}

module.exports = { notifyVendorsByPush };
