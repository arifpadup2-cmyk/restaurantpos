-- Rollback 001: Drop all core business tables (reverse order for FK safety)
DROP TABLE IF EXISTS day_closings;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS shifts;
DROP TABLE IF EXISTS tables_layout;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS cashiers;
DROP TABLE IF EXISTS settings;
