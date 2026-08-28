const pool = require('../config/db');
const { webpush, isConfigured } = require('../config/push');

// Default icons for tsvaga.app
const DEFAULT_ICON = 'https://tsvaga.app/icon-192.png';
const DEFAULT_BADGE = 'https://tsvaga.app/icons/512x512-monochrome.png';

async function notifyUsersByPush(userIds, payload) {
  if (!isConfigured) {
    console.error('[push] Skipped - VAPID keys are not configured on this server.');
    return;
  }
  if (!userIds.length) {
    console.log('[push] Skipped - no user IDs were passed in (nobody matched to notify).');
    return;
  }

  const { rows: subscriptions } = await pool.query(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)`,
    [userIds]
  );

  console.log(
    `[push] ${userIds.length} user(s) to notify, found ${subscriptions.length} device subscription(s) for them.`
  );
  if (!subscriptions.length) {
    console.log('[push] No subscriptions found for these user IDs - they may have never enabled notifications, or their subscription was deleted.');
    return;
  }

  // Merge in icon, badge, data - so every push shows the Tsvaga cart icon
  // and the correct monochrome status-bar badge, even if the caller didn't
  // explicitly pass one.
  const enrichedPayload = {
    title: payload.title,
    body: payload.body,
    icon: payload.icon || DEFAULT_ICON, // big color icon
    badge: payload.badge || DEFAULT_BADGE, // small monochrome - must be white+transparent
    data: { url: payload.url || '/' }, // for click handling
    tag: payload.tag || 'tsvaga',
    renotify: true,
    ...payload, // let caller override if needed
  };

  console.log('[push] Payload:', JSON.stringify(enrichedPayload));

  const body = JSON.stringify(enrichedPayload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(pushSubscription, body);
        console.log(`[push] Sent successfully to subscription ${sub.id} (user ${sub.user_id}).`);
      } catch (err) {
        // 404/410 means the subscription is dead (browser data cleared, permission
        // revoked, endpoint no longer valid, etc.) - remove it so we stop wasting
        // sends on it.
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.error(
            `[push] Subscription ${sub.id} (user ${sub.user_id}) is dead (status ${err.statusCode}) - deleting it.`
          );
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        } else {
          console.error(
            `[push] Send FAILED for subscription ${sub.id} (user ${sub.user_id}): status=${err.statusCode} message=${err.message}`
          );
        }
      }
    })
  );
}

module.exports = { notifyUsersByPush };
