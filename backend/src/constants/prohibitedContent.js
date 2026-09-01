// Best-effort content filter for the request creation flow. This is
// deliberately keyword/phrase-based, not a foolproof enforcement mechanism -
// someone determined to evade it with creative spelling or slang we haven't
// listed will sometimes succeed. This exists to catch the obvious, common
// cases and give admins/reports a starting point, not to guarantee zero
// prohibited listings ever reach the platform.
//
// Phrases are used instead of bare single words wherever a word has a
// legitimate everyday meaning too - e.g. "kidney" alone would block grocery
// orders for kidney beans, "gun" alone would block staple guns/glue guns/nail
// guns/toy guns. Specific weapon models and drug names that have no such
// legitimate everyday meaning are listed as single words.

const PROHIBITED_TERMS = [
  // Illegal drugs / harmful substances
  'cocaine', 'coke for sale', 'crack cocaine', 'marijuana', 'cannabis', 'weed for sale',
  'dagga', 'mbanje', 'ganja', 'crystal meth', 'methamphetamine', 'heroin', 'mdma',
  'ecstasy pills', 'molly drug', 'lsd tabs', 'acid tabs', 'magic mushrooms', 'opium',
  'illicit morphine', 'fentanyl', 'bronclene', 'broncleer', 'codeine syrup', 'nyaope',
  'khat', 'miraa', 'quaaludes', 'meth crystals', 'illegal drugs', 'street drugs',

  // Small arms / weapons
  'handgun', 'pistol', 'rifle', 'ak-47', 'ak47', 'shotgun', 'firearm', 'ammunition',
  'ammo rounds', 'bullets for sale', 'assault rifle', 'ar-15', 'revolver', 'grenade',
  'explosives for sale', 'dynamite', 'homemade bomb', 'silencer', 'machine gun',
  'ghost gun', 'illegal weapon',

  // Human organs
  'human kidney', 'sell my kidney', 'buy a kidney', 'kidney for sale', 'human organ',
  'organ for sale', 'sell my liver', 'liver for sale', 'human blood for sale',
  'organ trafficking', 'cornea for sale', 'sell my organ',

  // Sex toys
  'dildo', 'vibrator', 'sex toy', 'adult toy', 'fleshlight', 'blow up doll',
  'sex doll', 'anal plug', 'butt plug', 'cock ring', 'penis pump', 'inflatable doll',

  // Pornographic material
  'porn', 'pornographic', 'xxx video', 'nude video', 'sex tape', 'adult film',
  'explicit video', 'nude pictures', 'nude photos',
];

// Returns true if the given text contains any prohibited term. Case
// insensitive. Deliberately does NOT reveal which specific term matched to
// the caller - see requests.js for how the rejection message is worded.
function containsProhibitedContent(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PROHIBITED_TERMS.some((term) => lower.includes(term));
}

module.exports = { containsProhibitedContent };
