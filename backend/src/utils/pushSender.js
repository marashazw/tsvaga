const pool = require('../config/db');
const { webpush, isConfigured } = require('../config/push');

// Default icons for tsvaga.app
const DEFAULT_ICON = 'https://tsvaga.app/icon-192.png';
const DEFAULT_BADGE = 'https://tsvaga.app/icons/512x512-monochrome.png';

async function notifyUsersByPush(userIds, payload) {
  if (!isConfigured || !userIds.length) return;

  const { rows: subscriptions } = await pool.query(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)`,
    [userIds]
  );

  // THIS IS THE FIX: Merge in icon, badge, data
  const enrichedPayload = {
    title: payload.title,
    body: payload.body,
    icon: payload.icon || DEFAULT_ICON, // big color icon
    badge: payload.badge || DEFAULT_BADGE, // small monochrome - must be black+transparent
    data: { url: payload.url || '/' }, // for click handling
    tag: payload.tag || 'tsvaga',
    renotify: true,
    ...payload // let caller override if needed
  };

  const body = JSON.stringify(enrichedPayload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(pushSubscription, body);
      } catch (err) {
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