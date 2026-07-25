const pool = require('../config/db');
const { webpush, isConfigured } = require('../config/push');

// Sends a push notification to all of a user's registered devices/browsers -
// works for requesters and vendors alike. This is what reaches someone even
// if the tab/app is closed, as long as the browser has the service worker
// registered. Socket.io alerts only reach an *open* tab; push is the
// fallback for "not staring at the screen right now".
async function notifyUsersByPush(userIds, payload) {
  if (!isConfigured || !userIds.length) return;

  const { rows: subscriptions } = await pool.query(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)`,
    [userIds]
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
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        } else {
          console.error('Push send failed for subscription', sub.id, err.message);
        }
      }
    })
  );
}

module.exports = { notifyUsersByPush };
