import React, { useEffect, useState } from 'react';

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function InstallPrompt({ appName, iconSrc }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed - nothing to show

    function onBeforeInstallPrompt(e) {
      e.preventDefault(); // stop the browser's own subtle mini-infobar
      setDeferredPrompt(e);
      setVisible(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    function onInstalled() {
      setVisible(false);
      setDeferredPrompt(null);
    }
    window.addEventListener('appinstalled', onInstalled);

    // iOS never fires beforeinstallprompt at all - Apple doesn't support it -
    // so show simple manual instructions there instead of a broken button.
    if (isIOS()) {
      setShowIOSInstructions(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    // Just hides it for this page view - no permanent memory, so it shows
    // again on the next visit rather than being gone for good after one tap.
    setVisible(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice; // resolves once the person picks Install or Cancel
    setDeferredPrompt(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="install-banner">
      <img src={iconSrc} alt="" className="install-banner-icon" />
      <div className="install-banner-text">
        <strong>Install {appName}</strong>
        {showIOSInstructions ? (
          <span>Tap the Share button, then "Add to Home Screen"</span>
        ) : (
          <span>Add it to your home screen for quick, full-screen access</span>
        )}
      </div>
      <div className="install-banner-actions">
        {!showIOSInstructions && (
          <button onClick={handleInstall}>Install</button>
        )}
        <button className="secondary" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
