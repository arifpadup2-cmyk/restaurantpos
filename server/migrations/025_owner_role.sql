-- Backfill: the first bo_user per restaurant (the signup creator) gets role='owner'
UPDATE bo_users
SET role = 'owner'
WHERE role = 'admin'
  AND restaurant_id IS NOT NULL
  AND id IN (
    SELECT DISTINCT ON (restaurant_id) id
    FROM bo_users
    WHERE restaurant_id IS NOT NULL
    ORDER BY restaurant_id, id ASC
  );
