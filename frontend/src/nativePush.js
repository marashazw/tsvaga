import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api';

// Registers this device for native push (FCM, via Capacitor) - a no-op
// entirely on web/PWA, since Capacitor.isNativePlatform() is only true
// inside the installed native app shell. This is a completely separate,
// additional channel alongside the existing Web Push (see push.js) - a
// person using the installed app AND the website in a browser gets
// notified through both, since notifyUsersByPush on the backend checks
// both tables independently.
export async function registerNativePush() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted') {
      console.log('[native-push] Permission not granted.');
      return;
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      try {
        await api.post('/users/me/fcm-token', { token: token.value });
        console.log('[native-push] Token registered with backend.');
      } catch (err) {
        console.error('[native-push] Failed to send token to backend:', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[native-push] Registration error:', err);
    });

    // Foreground notifications don't show a system banner automatically on
    // Android - logged here for now. Can be routed into an in-app toast
    // later if desired.
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[native-push] Received while app open:', notification);
    });

    // Tapping a notification while the app was backgrounded - reuses the
    // same "url" data field the backend already sends for web push, so a
    // tap can navigate to the relevant screen either way.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action.notification?.data?.url;
      if (url) window.location.href = url;
    });
  } catch (err) {
    console.error('[native-push] Setup failed:', err);
  }
}
