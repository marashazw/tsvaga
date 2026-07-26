// A short, synthesized "ping" - generated on the fly with the Web Audio API
// rather than an audio file, so there's nothing to host or license. Browsers
// sometimes suspend audio until the user has interacted with the page at
// least once; if that happens this just fails silently, which is fine - it's
// a nice-to-have, not essential to the chat working.
export function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
    oscillator.frequency.setValueAtTime(1108, ctx.currentTime + 0.12); // C#6 - quick two-note "ping"

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
  } catch (err) {
    // Web Audio unavailable or blocked - not critical, just skip the sound.
  }
}
