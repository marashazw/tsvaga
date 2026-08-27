// Common product/service categories used for both a requester's request tags
// and a vendor's notification preferences. 'miscellaneous' is the catch-all -
// any request with no other category, or that a requester leaves unassigned,
// gets tagged with this and is broadcast to every nearby vendor regardless of
// their individual category selections.
const CATEGORIES = [
  'groceries',
  'electronics',
  'clothing',
  'hardware',
  'health',
  'automotive',
  'home',
  'beauty',
  'stationery',
  'baby_kids',
  'sports',
  'garden',
  'leisure',
  'miscellaneous',
];

// Filters an arbitrary input array down to only valid, known category slugs.
function sanitizeCategories(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((c) => CATEGORIES.includes(c)))];
}

module.exports = { CATEGORIES, sanitizeCategories };
