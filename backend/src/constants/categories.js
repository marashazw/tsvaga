// Common product/service categories used for both a requester's request tags
// and a vendor's notification preferences. 'miscellaneous' is the catch-all -
// any request with no other category, or that a requester leaves unassigned,
// gets tagged with this and is broadcast to every nearby vendor regardless of
// their individual category selections.
//
// PRODUCT_CATEGORIES and SERVICE_CATEGORIES are kept as separate exported
// lists purely so the frontend can show the right set depending on whether
// someone is posting a product or service request - but they share ONE
// underlying vendor preference system (notify_categories), one validation
// function, and one matching pipeline. A vendor is just a vendor; a plumber
// selects 'plumbing' the same way a grocer selects 'groceries'.
const PRODUCT_CATEGORIES = [
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
];

const SERVICE_CATEGORIES = [
  'plumbing',
  'electrical_services',
  'transport_logistics',
  'construction',
  'it_design_services',
  'tutoring_lessons',
  'cleaning_services',
  'legal_admin_services',
  'event_services',
  'repair_services',
  'automotive_services',
  'beauty_wellness_services',
];

const CATEGORIES = [...PRODUCT_CATEGORIES, ...SERVICE_CATEGORIES, 'miscellaneous'];

// Filters an arbitrary input array down to only valid, known category slugs.
function sanitizeCategories(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((c) => CATEGORIES.includes(c)))];
}

module.exports = { CATEGORIES, PRODUCT_CATEGORIES, SERVICE_CATEGORIES, sanitizeCategories };
