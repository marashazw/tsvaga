const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('Add these to your backend .env (and the public key to the frontend .env):\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`\n(Frontend .env) VITE_VAPID_PUBLIC_KEY=${keys.publicKey}`);
