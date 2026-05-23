-- Insert Vehicle Order type for every restaurant that doesn't already have it
INSERT INTO order_types (id, restaurant_id, name, enabled, icon, sort_order)
SELECT
  CONCAT(TO_HEX(FLOOR(EXTRACT(EPOCH FROM NOW())*1000)::BIGINT), SUBSTRING(MD5(RANDOM()::TEXT), 1, 5)),
  r.id,
  'Vehicle Order',
  true,
  'vehicle',
  COALESCE((SELECT MAX(sort_order) + 1 FROM order_types ot2 WHERE ot2.restaurant_id = r.id), 4)
FROM restaurants r
WHERE NOT EXISTS (
  SELECT 1 FROM order_types ot
  WHERE ot.restaurant_id = r.id AND LOWER(ot.name) = 'vehicle order'
);
