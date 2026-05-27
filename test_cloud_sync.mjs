'use strict'
// Cloud sync integration test — tests all new /sync/* endpoints on the cloud server.
// Usage:  node test_cloud_sync.mjs [api-key]

const CLOUD  = 'https://restaurantpos-8xew.onrender.com'
const BRAND  = 'REST-GPPE8G'
const OUTLET = 'out-9f0d3eeea37a476a'
const APIKEY = process.argv[2] || 'pos-api-key-2026'

let pass = 0, fail = 0

function ok (label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); pass++ }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); fail++ }
}

async function get (path, key) {
  const h = key ? { 'x-api-key': key } : {}
  const r = await fetch(CLOUD + path, { headers: h, signal: AbortSignal.timeout(20_000) })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function post (path, body, key) {
  const r = await fetch(CLOUD + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

// ── Test data ─────────────────────────────────────────────────────────────────
const TEST_ORDER = {
  id:             'test-csync-' + Date.now(),
  order_number:   'CSYNC-001',
  order_type:     'dine-in',
  status:         'completed',
  subtotal:       20.00,
  tax_rate:       0.06,
  tax_amount:     1.20,
  discount_type:  'none',
  discount_value: 0,
  discount_amount:0,
  total:          21.20,
  payment_method: 'cash',
  payment_received:22.00,
  change_amount:  0.80,
  cashier_id:     'd7c861728174436d9f71',
  cashier_name:   'Ali Cashier',
  shift_id:       'shift-test-001',
  terminal_id:    'POS-TEST',
  outlet_id:      OUTLET,
  brand_id:       BRAND,
  created_at:     Date.now() - 60000,
  updated_at:     Date.now(),
  billed_at:      Date.now(),
  synced:         0,
  items: [
    { id: 'test-item-' + Date.now(), order_id: 'test-csync-' + Date.now(),
      item_id: 'menu-item-test', item_name: 'Test Item', category_name: 'Test',
      quantity: 2, unit_price: 10.00, total_price: 20.00 }
  ]
}

// ── Run tests ─────────────────────────────────────────────────────────────────
console.log(`\n  Cloud Sync Test — ${CLOUD}`)
console.log(`  Brand: ${BRAND}  API Key: ${APIKEY}\n`)

// 1. Health
const health = await get('/health')
ok('Health check', health.status === 200 && health.body.ok)

// 2. /sync/status (no auth)
const status = await get('/sync/status')
ok('/sync/status reachable (no auth)',  status.status === 200)
ok('/sync/status returns role field',   status.body.role === 'cloud' || status.body.role === 'local',
   JSON.stringify(status.body).slice(0, 120))

const onCloud = status.body.role === 'cloud'
if (!onCloud) {
  console.log('\n  ⚠️  IS_CLOUD_SERVER=true not set on Render.')
  console.log('     Add it in Render → Environment → IS_CLOUD_SERVER=true → redeploy.')
  console.log('     (sync/status will report role:cloud after that)\n')
}

// 3. /sync/server-pull — menu (requires API key)
const pullMenu = await get(`/sync/server-pull?brand_id=${BRAND}&entity=menu`, APIKEY)
ok('/sync/server-pull menu — returns 200',     pullMenu.status === 200,        `got ${pullMenu.status}`)
ok('/sync/server-pull menu — has categories',  Array.isArray(pullMenu.body?.categories), JSON.stringify(pullMenu.body).slice(0,80))
ok('/sync/server-pull menu — has items',       Array.isArray(pullMenu.body?.items),      `items=${pullMenu.body?.items?.length}`)
if (pullMenu.status === 200)
  console.log(`     → ${pullMenu.body.categories?.length} categories, ${pullMenu.body.items?.length} items`)

// 4. /sync/server-pull — cashiers
const pullStaff = await get(`/sync/server-pull?brand_id=${BRAND}&entity=cashiers`, APIKEY)
ok('/sync/server-pull cashiers — returns 200', pullStaff.status === 200,        `got ${pullStaff.status}`)
ok('/sync/server-pull cashiers — has staff',   Array.isArray(pullStaff.body?.cashiers), `cashiers=${pullStaff.body?.cashiers?.length}`)
if (pullStaff.status === 200)
  console.log(`     → ${pullStaff.body.cashiers?.length} cashiers`)

// 5. /sync/server-pull — missing params → 400
const pullBad = await get('/sync/server-pull', APIKEY)
ok('/sync/server-pull — 400 on missing params', pullBad.status === 400)

// 6. /sync/server-push — orders (requires API key)
TEST_ORDER.items[0].order_id = TEST_ORDER.id  // fix reference
const push = await post('/sync/server-push', { brand_id: BRAND, entity: 'orders', records: [TEST_ORDER] }, APIKEY)
ok('/sync/server-push orders — returns 200', push.status === 200,     `got ${push.status}: ${JSON.stringify(push.body).slice(0,80)}`)
ok('/sync/server-push orders — ok:true',     push.body?.ok === true,  JSON.stringify(push.body))
ok('/sync/server-push orders — upserted 1',  push.body?.upserted === 1, `upserted=${push.body?.upserted}`)

// 7. /sync/server-push — empty records → ok with 0
const pushEmpty = await post('/sync/server-push', { brand_id: BRAND, entity: 'orders', records: [] }, APIKEY)
ok('/sync/server-push empty — ok with 0', pushEmpty.status === 200 && pushEmpty.body?.ok)

// 8. /sync/server-push — missing params → 400
const pushBad = await post('/sync/server-push', { brand_id: BRAND }, APIKEY)
ok('/sync/server-push — 400 on missing entity', pushBad.status === 400)

// 9. /sync/server-push — no auth → 401
const pushNoAuth = await post('/sync/server-push', { brand_id: BRAND, entity: 'orders', records: [] }, '')
ok('/sync/server-push — 401 without API key', pushNoAuth.status === 401 || pushNoAuth.status === 403,
   `got ${pushNoAuth.status}`)

// 10. /sync/status after push — cloud state updated
const status2 = await get('/sync/status')
ok('/sync/status after push — 200', status2.status === 200)
if (onCloud) {
  const syncRow = (status2.body?.syncs || []).find(s => s.entity === BRAND + ':orders')
  ok('/sync/status — push received recorded', !!syncRow, `syncs=${JSON.stringify(status2.body?.syncs).slice(0,100)}`)
} else {
  console.log('     (skip cloud-side sync tracking check — IS_CLOUD_SERVER not set)')
}

// ── Summary ───────────────────────────────────────────────────────────────────
const total = pass + fail
console.log(`\n  ${pass}/${total} passed${fail > 0 ? `  (${fail} failed)` : ' ✅'}\n`)
if (!onCloud) {
  console.log('  Next step: add IS_CLOUD_SERVER=true on Render, then re-run this test.\n')
}
