const pool = require('../config/db');
const { webpush, isConfigured } = require('../config/push');
const { messaging, isConfigured: fcmConfigured } = require('../config/fcm');

// Default icons for tsvaga.app
const DEFAULT_ICON = 'https://tsvaga.app/icon-192.png';
const DEFAULT_BADGE = 'https://tsvaga.app/icons/512x512-monochrome.png';

// Sends a push notification to a set of users across BOTH channels this
// app supports: Web Push (VAPID) for anyone using Tsvaga as a website/PWA
// in a browser, and FCM for anyone using the installed native Capacitor
// app. A user can have subscriptions in both at once (nothing stops
// someone from using both), so both are always attempted independently -
// one channel being unconfigured or having no subscriptions for this user
// never blocks the other from sending.
async function notifyUsersByPush(userIds, payload) {
  if (!userIds.length) {
    console.log('[push] Skipped - no user IDs were passed in (nobody matched to notify).');
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

  await Promise.all([sendWebPush(userIds, enrichedPayload), sendFcmPush(userIds, enrichedPayload)]);
}

async function sendWebPush(userIds, enrichedPayload) {
  if (!isConfigured) {
    console.error('[push:web] Skipped - VAPID keys are not configured on this server.');
    return;
  }

  const { rows: subscriptions } = await pool.query(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)`,
    [userIds]
  );

  console.log(
    `[push:web] ${userIds.length} user(s) to notify, found ${subscriptions.length} browser subscription(s) for them.`
  );
  if (!subscriptions.length) return;

  const body = JSON.stringify(enrichedPayload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(pushSubscription, body);
        console.log(`[push:web] Sent successfully to subscription ${sub.id} (user ${sub.user_id}).`);
      } catch (err) {
        // 404/410 means the subscription is dead (browser data cleared, permission
        // revoked, endpoint no longer valid, etc.) - remove it so we stop wasting
        // sends on it.
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.error(
            `[push:web] Subscription ${sub.id} (user ${sub.user_id}) is dead (status ${err.statusCode}) - deleting it.`
          );
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        } else {
          console.error(
            `[push:web] Send FAILED for subscription ${sub.id} (user ${sub.user_id}): status=${err.statusCode} message=${err.message}`
          );
        }
      }
    })
  );
}

async function sendFcmPush(userIds, enrichedPayload) {
  if (!fcmConfigured) {
    console.error('[push:fcm] Skipped - FIREBASE_SERVICE_ACCOUNT is not configured on this server.');
    return;
  }

  const { rows: tokens } = await pool.query(`SELECT id, user_id, token FROM fcm_tokens WHERE user_id = ANY($1)`, [
    userIds,
  ]);

  console.log(`[push:fcm] ${userIds.length} user(s) to notify, found ${tokens.length} native app token(s) for them.`);
  if (!tokens.length) return;

  await Promise.all(
    tokens.map(async (t) => {
      try {
        await messaging.send({
          token: t.token,
          notification: { title: enrichedPayload.title, body: enrichedPayload.body },
          data: { url: enrichedPayload.data.url },
          android: { notification: { icon: 'ic_notification', tag: enrichedPayload.tag } },
        });
        console.log(`[push:fcm] Sent successfully to token ${t.id} (user ${t.user_id}).`);
      } catch (err) {
        // registration-token-not-registered means the app was uninstalled,
        // the token rotated, etc - remove it so we stop wasting sends on it.
        if (err.code === 'messaging/registration-token-not-registered') {
          console.error(`[push:fcm] Token ${t.id} (user ${t.user_id}) is dead - deleting it.`);
          await pool.query('DELETE FROM fcm_tokens WHERE id = $1', [t.id]);
        } else {
          console.error(`[push:fcm] Send FAILED for token ${t.id} (user ${t.user_id}): ${err.message}`);
        }
      }
    })
  );
}

module.exports = { notifyUsersByPush };
