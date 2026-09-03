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

  // Illegal or seriously harmful services (relevant now that Tsvaga supports
  // service requests, not just products)
  'hitman', 'contract killing', 'assassination service', 'hire a hitman',
  'human trafficking', 'people smuggling', 'illegal border crossing', 'smuggle person',
  'fake passport', 'fake id', 'forged id', 'forged passport', 'fake degree',
  'fake certificate', 'buy a degree', 'exam impersonation', 'sit exam for me',
  'escort service', 'prostitute for hire', 'sex worker for hire',
  'drug mule', 'drug courier service', 'smuggle drugs',
  'money laundering service', 'launder money', 'illegal wiretapping',
  'spy on my partner', 'phone tapping service', 'stalk someone service',
  'kidnapping service', 'extortion service', 'blackmail service',
];

// Returns true if the given text contains any prohibited term. Case
// insensitive. Deliberately does NOT reveal which specific term matched to
// the caller - see requests.js for how the rejection message is worded.
function containsProhibitedContent(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PROHIBITED_TERMS.some((term) => lower.includes(term));
}

const REJECTION_MESSAGE =
  'This cannot be submitted on Tsvaga. We do not allow content related to weapons, drugs or controlled ' +
  'substances, human organs, sexual products or services, pornographic material, or other illegal services.';

// Records a blocked attempt to flagged_content for admin visibility, then
// sends the standard rejection response. Call this instead of just checking
// containsProhibitedContent() directly, everywhere a user submits free text -
// keeps the message and the audit trail consistent across every entry point.
async function flagAndReject(pool, req, res, context, text) {
  try {
    await pool.query(
      'INSERT INTO flagged_content (user_id, context, submitted_text) VALUES ($1, $2, $3)',
      [req.user?.id || null, context, text]
    );
  } catch (err) {
    // Never let a logging failure block the rejection itself from going out.
    console.error('Failed to record flagged content:', err);
  }
  res.status(422).json({ error: REJECTION_MESSAGE });
}

module.exports = { containsProhibitedContent, flagAndReject };
