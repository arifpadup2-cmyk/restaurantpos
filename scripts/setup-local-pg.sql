-- PostgreSQL setup script for local Restaurant POS installation
-- Run this script once as the postgres superuser to create the database and user
--
-- Usage (on Windows PowerShell):
--   psql -U postgres -f scripts/setup-local-pg.sql
--
-- Or (on Mac/Linux):
--   psql -U postgres -f scripts/setup-local-pg.sql

-- Create the POS user (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'pos_central_user') THEN
    CREATE USER pos_central_user WITH PASSWORD 'pos_secure_2024!';
  END IF;
END $$;

-- Create the POS database (if not exists)
SELECT 'CREATE DATABASE restaurant_pos_central OWNER pos_central_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'restaurant_pos_central')\gexec

-- Grant privileges on the database
GRANT ALL PRIVILEGES ON DATABASE restaurant_pos_central TO pos_central_user;

-- Connect to the new database and grant schema privileges
\c restaurant_pos_central

GRANT ALL ON SCHEMA public TO pos_central_user;

-- Set default privileges for future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pos_central_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO pos_central_user;

-- Success message
SELECT 'Local PostgreSQL setup complete!';
SELECT 'Connection details:';
SELECT '  Host: 127.0.0.1 (localhost)';
SELECT '  Port: 5432';
SELECT '  Database: restaurant_pos_central';
SELECT '  Username: pos_central_user';
SELECT '  Password: pos_secure_2024!';
