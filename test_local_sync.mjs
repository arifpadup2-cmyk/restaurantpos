'use strict'
// Local server cloud-sync test.
// Verifies the daemon starts, pushes to cloud, and pulls from cloud.
// Run AFTER restarting the local server with cloud sync env vars set.

const LOCAL  = 'http://127.0.0.1:3001'
const CLOUD  = 'https://restaurantpos-8xew.onrender.com'
const APIKEY = 'pos-api-key-2026'
const BRAND  = 'REST-GPPE8G'

let pass = 0, fail = 0

function ok (label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); pass++ }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); fail++ }
}

async function get (base, path, key) {
  const h = key ? { 'x-api-key': key } : {}
  const r = await fetch(base + path, { headers: h, signal: AbortSignal.timeout(20_000) })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function post (base, path, body, key) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

console.log(`\n  Local Server Cloud Sync Test`)
console.log(`  Local: ${LOCAL}  →  Cloud: ${CLOUD}\n`)

// 1. Local server health
const health = await get(LOCAL, '/health')
ok('Local server health', health.status === 200 && health.body.ok)

// 2. /sync/status — check daemon initialized
const status = await get(LOCAL, '/sync/status', APIKEY)
ok('/sync/status reachable',              status.status === 200)
ok('/sync/status role = local',           status.body.role === 'local',      JSON.stringify(status.body).slice(0,120))
ok('/sync/status daemon initialized',     status.body.initialized === true,
   'daemon not started — restart local server with CLOUD_SYNC_URL/KEY/BRAND_ID set in .env')

if (!status.body.initialized) {
  console.log('\n  ⚠️  Daemon is not running.')
  console.log('     Restart the local server: stop it and run "npm start" in the server/ directory.')
  console.log('     Then re-run this test.\n')
  process.exit(0)
}

console.log(`     Cloud URL: ${status.body.cloudUrl}`)
console.log(`     Brand ID:  ${status.body.brandId}`)

// 3. Check entities table has sync cursors
const entities = status.body.entities || []
ok('/sync/status has entity rows', entities.length > 0, `entities: ${JSON.stringify(entities).slice(0,80)}`)

// 4. Manual push trigger
const push = await post(LOCAL, '/sync/trigger-push', {}, APIKEY)
ok('/sync/trigger-push returns 200', push.status === 200, `got ${push.status}`)
ok('/sync/trigger-push ok:true',     push.body?.ok === true, JSON.stringify(push.body).slice(0,80))

// 5. Check status updated after push
const status2 = await get(LOCAL, '/sync/status', APIKEY)
const pushStats = status2.body?.push || {}
const hasPushActivity = Object.keys(pushStats).length > 0
ok('Push activity recorded in status', hasPushActivity, JSON.stringify(pushStats).slice(0,80))
if (hasPushActivity) {
  for (const [entity, info] of Object.entries(pushStats)) {
    const age = Math.floor((Date.now() - info.at) / 1000)
    console.log(`     pushed ${entity}: ${info.count} records (${age}s ago)`)
  }
}

// 6. Verify cloud received the push
const cloudStatus = await get(CLOUD, '/sync/status')
ok('Cloud /sync/status reachable', cloudStatus.status === 200)
const syncRow = (cloudStatus.body?.syncs || []).find(s => s.entity === BRAND + ':orders')
ok('Cloud shows last push received', !!syncRow,
   `syncs: ${JSON.stringify(cloudStatus.body?.syncs || []).slice(0,100)}`)
if (syncRow) {
  const age = Math.floor((Date.now() - syncRow.last_push_at) / 1000)
  console.log(`     cloud last push: ${syncRow.push_count} total orders, ${age}s ago`)
}

// 7. Pull — verify cloud data landed locally
// Check menu is synced (categories should exist locally)
const localMenu = await get(LOCAL, '/sync/menu', APIKEY)
ok('Local /sync/menu returns data', localMenu.status === 200 && Array.isArray(localMenu.body?.categories))
if (localMenu.status === 200)
  console.log(`     local menu: ${localMenu.body.categories?.length} categories, ${localMenu.body.items?.length} items`)

// 8. Check pull stats
const pullStats = status2.body?.pull || {}
const hasPullActivity = Object.keys(pullStats).length > 0
ok('Pull activity recorded in status', hasPullActivity, JSON.stringify(pullStats).slice(0,80))
if (hasPullActivity) {
  for (const [entity, info] of Object.entries(pullStats)) {
    const age = Math.floor((Date.now() - info.at) / 1000)
    console.log(`     pulled ${entity}: ${info.count} records (${age}s ago)`)
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
const total = pass + fail
console.log(`\n  ${pass}/${total} passed${fail > 0 ? `  (${fail} failed)` : ' ✅'}\n`)
