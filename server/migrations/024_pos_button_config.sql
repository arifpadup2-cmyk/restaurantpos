CREATE TABLE IF NOT EXISTS pos_button_config (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  button_key    TEXT NOT NULL,
  visible       BOOLEAN DEFAULT TRUE,
  sort_order    INT DEFAULT 0,
  UNIQUE(restaurant_id, button_key)
);
