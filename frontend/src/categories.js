// Keep this list of slugs in sync with backend/src/constants/categories.js -
// 'miscellaneous' is always last and always the fallback when nothing more
// specific is assigned or auto-detected.
export const CATEGORIES = [
  { slug: 'groceries', label: 'Groceries & Food', keywords: ['rice', 'sugar', 'bread', 'milk', 'maize', 'mealie', 'flour', 'cooking oil', 'eggs', 'meat', 'beef', 'pork', 'chicken', 'fish', 'vegetable', 'fruit', 'snack', 'beverage', 'soda', 'water', 'tea', 'coffee', 'grocery', 'groceries', 'banana', 'apple', 'orange', 'mango', 'avocado', 'guava', 'lemon', 'tomato', 'onion', 'potato', 'cabbage', 'carrot', 'spinach', 'covo', 'rape', 'beans', 'peanut butter', 'mazoe', 'salt', 'spice', 'biscuit', 'juice', 'yogurt', 'cheese', 'butter', 'margarine', 'peanut', 'nuts', 'jam', 'cereal', 'porridge', 'pasta', 'spaghetti', 'sadza', 'food'] },
  { slug: 'electronics', label: 'Electronics', keywords: ['phone', 'smartphone', 'laptop', 'charger', 'tv', 'television', 'radio', 'speaker', 'cable', 'battery', 'earphone', 'headphone', 'camera', 'fridge', 'freezer', 'microwave', 'electronic', 'tablet', 'computer', 'keyboard', 'mouse', 'adapter', 'sim card', 'airtime', 'data bundle', 'solar panel', 'inverter', 'generator', 'router', 'wifi', 'flash drive', 'memory card', 'power bank'] },
  { slug: 'clothing', label: 'Clothing & Fashion', keywords: ['shirt', 't-shirt', 'trouser', 'dress', 'shoe', 'jacket', 'jean', 'skirt', 'sock', 'underwear', 'hat', 'belt', 'clothes', 'clothing', 'blouse', 'sweater', 'jersey', 'tie', 'uniform', 'sandal', 'boot', 'cap', 'scarf', 'suit'] },
  { slug: 'hardware', label: 'Hardware & Building', keywords: ['cement', 'nail', 'paint', 'pipe', 'wire', 'tool', 'hammer', 'drill', 'timber', 'brick', 'tile', 'plumbing', 'hardware', 'screw', 'bolt', 'ladder', 'wheelbarrow', 'roofing', 'gutter', 'padlock', 'lock', 'hinge', 'sand', 'quarry stone', 'gate', 'fence'] },
  { slug: 'health', label: 'Health & Pharmacy', keywords: ['medicine', 'tablet', 'pill', 'pharmacy', 'bandage', 'vitamin', 'mask', 'sanitizer', 'panadol', 'syrup', 'drug', 'cough', 'headache', 'painkiller', 'first aid', 'thermometer', 'contraceptive', 'condom', 'plaster', 'antibiotic', 'malaria'] },
  { slug: 'automotive', label: 'Automotive', keywords: ['tyre', 'tire', 'car ', 'engine oil', 'spare part', 'brake', 'fuel', 'petrol', 'diesel', 'vehicle', 'car battery', 'windscreen', 'clutch', 'exhaust', 'radiator', 'car wash'] },
  { slug: 'home', label: 'Home & Furniture', keywords: ['chair', 'table', 'bed', 'sofa', 'couch', 'mattress', 'curtain', 'shelf', 'wardrobe', 'furniture', 'bucket', 'broom', 'mop', 'plate', 'cup', 'cutlery', 'kettle', 'iron', 'blanket', 'pillow', 'towel', 'basin', 'cooler box', 'gas cylinder', 'gas stove'] },
  { slug: 'beauty', label: 'Beauty & Personal Care', keywords: ['soap', 'shampoo', 'lotion', 'makeup', 'perfume', 'cream', 'toothpaste', 'razor', 'cosmetic', 'deodorant', 'hair', 'wig', 'braids', 'nail polish', 'toothbrush', 'sanitary pad', 'tissue', 'roll on'] },
  { slug: 'stationery', label: 'Stationery & Office', keywords: ['pen', 'pencil', 'notebook', 'paper', 'printer', 'ink', 'stapler', 'folder', 'stationery', 'book', 'textbook', 'exercise book', 'ruler', 'eraser', 'calculator', 'crayon', 'glue', 'scissors', 'file', 'envelope', 'toner'] },
  { slug: 'baby_kids', label: 'Baby & Kids', keywords: ['diaper', 'nappy', 'baby', 'toy', 'formula', 'stroller', 'kids', 'pram', 'cot', 'school bag', 'baby food', 'baby wipes'] },
  { slug: 'sports', label: 'Sports & Outdoor', keywords: ['ball', 'gym', 'bicycle', 'tent', 'fishing', 'sport', 'football', 'netball', 'racket', 'skipping rope', 'dumbbell', 'boxing'] },
  { slug: 'miscellaneous', label: 'Miscellaneous / General', keywords: [] },
];

// Client-side, keyword-based auto-suggestion - not meant to be perfect, just
// a reasonable starting point the requester can always correct or add to.
export function suggestCategories(productText) {
  if (!productText || !productText.trim()) return [];
  const text = productText.toLowerCase();
  return CATEGORIES.filter((c) => c.keywords.some((k) => text.includes(k))).map((c) => c.slug);
}
