// Shared constant/helper for the separate Help Center site, where all
// payment flows (subscription, priority ranking, ads) live - kept out of
// the TWA app itself for Play Store payment policy compliance.
export const HELP_CENTER_URL = 'https://tsvagahelpcenter.vercel.app';

// Builds the Help Center link with the vendor's phone number attached as a
// query parameter, so they land on a pre-filled login instead of having to
// type their number again on a completely separate site. Falls back to the
// bare URL if phone isn't available yet (e.g. profile still loading).
export function buildHelpCenterUrl(phone) {
  if (!phone) return HELP_CENTER_URL;
  return `${HELP_CENTER_URL}/?phone=${encodeURIComponent(phone)}`;
}
