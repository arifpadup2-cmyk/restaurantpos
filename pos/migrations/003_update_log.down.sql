-- Rollback 003: Drop update transaction log
DROP INDEX IF EXISTS idx_utl_synced;
DROP INDEX IF EXISTS idx_utl_failed;
DROP INDEX IF EXISTS idx_utl_created;
DROP TABLE IF EXISTS update_transaction_log;
