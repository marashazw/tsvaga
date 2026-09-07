const admin = require('firebase-admin');

// Service account credentials are provided as a single JSON string in the
// FIREBASE_SERVICE_ACCOUNT env var (paste the whole downloaded file's
// contents as one line) - avoids needing to manage a separate credentials
// file in the deployment, consistent with how the rest of this app's
// config is handled purely through environment variables.
const { FIREBASE_SERVICE_ACCOUNT } = process.env;

let isConfigured = false;

if (FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    isConfigured = true;
  } catch (err) {
    console.error('[fcm] Failed to parse/initialize FIREBASE_SERVICE_ACCOUNT:', err.message);
  }
} else {
  console.warn('[fcm] FIREBASE_SERVICE_ACCOUNT not set - native app push notifications are disabled. Web push (VAPID) is unaffected.');
}

module.exports = { messaging: isConfigured ? admin.messaging() : null, isConfigured };
