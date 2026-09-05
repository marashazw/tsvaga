// Strips all whitespace from a phone number before it's stored or looked
// up. Login/registration/delete-account all match on phone via an EXACT
// string comparison (WHERE phone = $1) with no normalization at all - any
// difference in spacing between what was originally stored and what a
// later login attempt sends produces a silent, generic "Invalid phone
// number or password" even with the exact right password. This became a
// real problem when the phone input UI changed from a single free-text
// field to a country-code-select + digits pair: the new UI always
// reconstructs the full string as "code digits" (one space), but numbers
// stored under the old free-text input could have ended up with no space,
// a different amount of space, or other stray whitespace, and would no
// longer match. Applying this at both write time (register) and read time
// (login, delete-account) - plus a one-time backfill migration for
// anything already stored - keeps everything consistent regardless of
// which input UI a given user originally registered through.
function normalizePhone(phone) {
  return (phone || '').replace(/\s+/g, '');
}

module.exports = { normalizePhone };
