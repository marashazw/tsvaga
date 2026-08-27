-- Adds 'garden' and 'leisure' to the category list. For any vendor who
-- still has the full original 12-category set selected (i.e. never
-- customized it away from "all"), append the two new categories too - so
-- "notify me about all categories" keeps meaning all categories, rather
-- than silently excluding anything created after this migration. A vendor
-- who deliberately narrowed their own selection is left untouched - we
-- don't second-guess an explicit customization.

UPDATE vendors
SET notify_categories = notify_categories || ARRAY['garden', 'leisure']
WHERE notify_categories @> ARRAY[
  'groceries','electronics','clothing','hardware','health','automotive',
  'home','beauty','stationery','baby_kids','sports','miscellaneous'
]
AND NOT (notify_categories @> ARRAY['garden', 'leisure']);

-- Also update the table's own default, so freshly-registered vendors (who
-- get the default applied explicitly at signup via the app code, but this
-- keeps the column default consistent too) include the new categories.
ALTER TABLE vendors ALTER COLUMN notify_categories SET DEFAULT ARRAY[
  'groceries','electronics','clothing','hardware','health','automotive',
  'home','beauty','stationery','baby_kids','sports','garden','leisure','miscellaneous'
];
