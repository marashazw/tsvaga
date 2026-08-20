// Keep this list of slugs in sync with backend/src/constants/categories.js -
// 'miscellaneous' is always last and always the fallback when nothing more
// specific is assigned or auto-detected.
export const CATEGORIES = [
  { slug: 'groceries', label: 'Groceries & Food', keywords: ['rice', 'sugar', 'bread', 'milk', 'maize', 'mealie', 'flour', 'cooking oil', 'eggs', 'meat', 'chicken', 'vegetable', 'fruit', 'snack', 'beverage', 'soda', 'water', 'tea', 'coffee', 'grocery', 'groceries'] },
  { slug: 'electronics', label: 'Electronics', keywords: ['phone', 'laptop', 'charger', 'tv', 'television', 'radio', 'speaker', 'cable', 'battery', 'earphone', 'headphone', 'camera', 'fridge', 'freezer', 'microwave', 'electronic'] },
  { slug: 'clothing', label: 'Clothing & Fashion', keywords: ['shirt', 'trouser', 'dress', 'shoe', 'jacket', 'jean', 'skirt', 'sock', 'underwear', 'hat', 'belt', 'clothes', 'clothing'] },
  { slug: 'hardware', label: 'Hardware & Building', keywords: ['cement', 'nail', 'paint', 'pipe', 'wire', 'tool', 'hammer', 'drill', 'timber', 'brick', 'tile', 'plumbing', 'hardware'] },
  { slug: 'health', label: 'Health & Pharmacy', keywords: ['medicine', 'tablet', 'pill', 'pharmacy', 'bandage', 'vitamin', 'mask', 'sanitizer', 'panadol', 'syrup', 'drug'] },
  { slug: 'automotive', label: 'Automotive', keywords: ['tyre', 'tire', 'car ', 'engine oil', 'spare part', 'brake', 'fuel', 'petrol', 'diesel', 'vehicle'] },
  { slug: 'home', label: 'Home & Furniture', keywords: ['chair', 'table', 'bed', 'sofa', 'couch', 'mattress', 'curtain', 'shelf', 'wardrobe', 'furniture'] },
  { slug: 'beauty', label: 'Beauty & Personal Care', keywords: ['soap', 'shampoo', 'lotion', 'makeup', 'perfume', 'cream', 'toothpaste', 'razor', 'cosmetic'] },
  { slug: 'stationery', label: 'Stationery & Office', keywords: ['pen', 'pencil', 'notebook', 'paper', 'printer', 'ink', 'stapler', 'folder', 'stationery'] },
  { slug: 'baby_kids', label: 'Baby & Kids', keywords: ['diaper', 'nappy', 'baby', 'toy', 'formula', 'stroller', 'kids'] },
  { slug: 'sports', label: 'Sports & Outdoor', keywords: ['ball', 'gym', 'bicycle', 'tent', 'fishing', 'sport'] },
  { slug: 'miscellaneous', label: 'Miscellaneous / General', keywords: [] },
];

// Client-side, keyword-based auto-suggestion - not meant to be perfect, just
// a reasonable starting point the requester can always correct or add to.
export function suggestCategories(productText) {
  if (!productText || !productText.trim()) return [];
  const text = productText.toLowerCase();
  return CATEGORIES.filter((c) => c.keywords.some((k) => text.includes(k))).map((c) => c.slug);
}
