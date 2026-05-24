-- 036: Backfill brand_id on tables that were missing it
-- Required so brand-scoped queries (orders, audit, customers) don't lose
-- historical data after security fixes that scope all reads by brand_id.

BEGIN;

-- Orders: derive brand_id from outlet when missing
UPDATE orders
SET brand_id = outlets.brand_id
FROM outlets
WHERE orders.outlet_id = outlets.id
  AND orders.brand_id IS NULL;

-- Customers: brand_id added in 034 but not backfilled
-- Customers synced from terminals before the fix had no brand_id.
-- Recover via orders placed by those customers.
UPDATE customers c
SET brand_id = sub.brand_id
FROM (
  SELECT DISTINCT ON (customer_id) customer_id, brand_id
  FROM orders
  WHERE customer_id IS NOT NULL AND brand_id IS NOT NULL
  ORDER BY customer_id, created_at DESC
) sub
WHERE c.id = sub.customer_id AND c.brand_id IS NULL;

-- audit_log: derive brand_id from terminal registration
UPDATE audit_log al
SET brand_id = tr.brand_id
FROM terminal_registrations tr
WHERE al.terminal_id = tr.id
  AND al.brand_id IS NULL;

-- no_sale_log: same approach
UPDATE no_sale_log nsl
SET brand_id = tr.brand_id
FROM terminal_registrations tr
WHERE nsl.terminal_id = tr.id
  AND nsl.brand_id IS NULL;

COMMIT;
