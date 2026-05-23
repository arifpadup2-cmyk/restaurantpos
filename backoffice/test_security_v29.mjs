/**
 * Security regression test for v2.3.x fixes (migration 029)
 * Tests: multi-tenant isolation, auth hardening, rate limiting, PIN hashing
 */
import { chromium } from 'playwright'

const BASE = 'https://restaurantpos-8xew.onrender.com'
const ts   = Date.now()
const A_EMAIL = `sec_a_${ts}@test.com`
const B_EMAIL = `sec_b_${ts}@test.com`
const PASS    = 'Test@1234'

let passed = 0
let failed = 0

function ok  (label, val)  { console.log(`  ✅ ${label}:`, val); passed++ }
function fail(label, val)  { console.log(`  ❌ ${label}:`, val); failed++ }
function check(label, cond, detail = '') {
  cond ? ok(label, detail || 'pass') : fail(label, detail || 'fail')
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function signup(email, password) {
  const r = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json()
  if (!j.ok) throw new Error(`signup failed: ${j.error}`)
  // Skip onboarding
  await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${j.token}` },
    body: JSON.stringify({ setup_done: true }),
  })
  return j.token
}

async function api(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await r.text()
  try { return { status: r.status, body: JSON.parse(text) } }
  catch { return { status: r.status, body: text } }
}

// ── main ─────────────────────────────────────────────────────────────────────

;(async () => {
  console.log('\n=== Security Regression Test (migration 029) ===\n')
  console.log(`Tenant A: ${A_EMAIL}`)
  console.log(`Tenant B: ${B_EMAIL}\n`)

  // ── 1. Signup two isolated tenants ────────────────────────────────────────
  console.log('1. Creating tenant accounts...')
  let tokenA, tokenB
  try {
    tokenA = await signup(A_EMAIL, PASS)
    tokenB = await signup(B_EMAIL, PASS)
    ok('Both tenants created', 'A + B')
  } catch (e) {
    fail('Tenant creation', e.message)
    process.exit(1)
  }

  // ── 2. Printers require auth ──────────────────────────────────────────────
  console.log('\n2. Printers require authentication...')
  const pNoAuth = await api('GET', '/printers', null)
  check('GET /printers without token → 401', pNoAuth.status === 401, `status=${pNoAuth.status}`)

  const pWithAuth = await api('GET', '/printers', tokenA)
  check('GET /printers with token → 200', pWithAuth.status === 200, `status=${pWithAuth.status}`)

  // ── 3. Menu isolation ─────────────────────────────────────────────────────
  console.log('\n3. Menu tenant isolation...')

  // A creates a category
  const catA = await api('POST', '/menu/categories', tokenA, { name: 'TenantA-Exclusive', color: '#ff0000' })
  check('A creates category', catA.status === 201 || catA.status === 200, `status=${catA.status}`)
  const catAId = catA.body?.category?.id

  // B's menu should NOT contain A's category
  const menuB = await api('GET', '/menu', tokenB)
  check('B menu loads', menuB.status === 200, `status=${menuB.status}`)
  const bCatNames = (menuB.body?.categories || []).map(c => c.name)
  check("B cannot see A's category", !bCatNames.includes('TenantA-Exclusive'), `B sees: [${bCatNames.join(', ')}]`)

  // A's menu should contain A's category
  const menuA = await api('GET', '/menu', tokenA)
  const aCatNames = (menuA.body?.categories || []).map(c => c.name)
  check("A sees own category", aCatNames.includes('TenantA-Exclusive'), `A sees: [${aCatNames.join(', ')}]`)

  // ── 4. Cross-tenant category delete blocked ───────────────────────────────
  console.log('\n4. Cross-tenant delete protection...')
  if (catAId) {
    const delByB = await api('DELETE', `/menu/categories/${catAId}`, tokenB)
    // Should either 404 (not found for B) or still exist for A afterwards
    const menuAAfter = await api('GET', '/menu', tokenA)
    const aStillHasCat = (menuAAfter.body?.categories || []).some(c => c.id === catAId)
    check("B cannot delete A's category (still exists for A)", aStillHasCat, `B delete status=${delByB.status}`)
  } else {
    fail('Cross-tenant delete test', 'skipped — category not created')
  }

  // ── 5. Staff isolation ────────────────────────────────────────────────────
  console.log('\n5. Staff tenant isolation...')

  // A creates a cashier
  const cashierA = await api('POST', '/staff/cashiers', tokenA, { name: 'Alice-TenantA', pin: '1234', role: 'cashier' })
  check('A creates cashier', cashierA.status === 200, `status=${cashierA.status}`)

  // PIN not in response
  const pinInResponse = cashierA.body?.cashier?.pin !== undefined || cashierA.body?.cashier?.pin_hash !== undefined
  check('PIN not exposed in cashier response', !pinInResponse, `pin field present: ${pinInResponse}`)

  // B cannot see A's cashier
  const staffB = await api('GET', '/staff/cashiers', tokenB)
  check('B staff loads', staffB.status === 200, `status=${staffB.status}`)
  const bStaffNames = (staffB.body?.cashiers || []).map(c => c.name)
  check("B cannot see A's cashier", !bStaffNames.includes('Alice-TenantA'), `B sees: [${bStaffNames.join(', ')}]`)

  // A sees own cashier
  const staffA = await api('GET', '/staff/cashiers', tokenA)
  const aStaffNames = (staffA.body?.cashiers || []).map(c => c.name)
  check("A sees own cashier", aStaffNames.includes('Alice-TenantA'), `A sees: [${aStaffNames.join(', ')}]`)

  // ── 6. Reports isolation ──────────────────────────────────────────────────
  console.log('\n6. Reports route authentication...')
  const rptNoAuth = await api('GET', '/reports/expenses', null)
  check('GET /reports/expenses without token → 401', rptNoAuth.status === 401, `status=${rptNoAuth.status}`)

  const rptA = await api('GET', '/reports/expenses?from=2024-01-01&to=2025-12-31', tokenA)
  check('GET /reports/expenses with token → 200', rptA.status === 200, `status=${rptA.status}`)

  // ── 7. POST /auth/register requires admin ─────────────────────────────────
  console.log('\n7. /auth/register requires admin auth...')
  const regNoAuth = await api('POST', '/auth/register', null, { username: 'hacker', password: 'hacked123' })
  check('POST /auth/register without token → 401', regNoAuth.status === 401, `status=${regNoAuth.status}`)

  const regWithUserToken = await api('POST', '/auth/register', tokenA, { username: 'hacker2', password: 'hacked123' })
  check('POST /auth/register with non-admin token → 403', regWithUserToken.status === 403, `status=${regWithUserToken.status}`)

  // ── 8. Login rate limiting ────────────────────────────────────────────────
  console.log('\n8. Login rate limiting...')
  let rateLimited = false
  for (let i = 0; i < 12; i++) {
    const r = await api('POST', '/auth/login', null, { username: 'nonexistent_test_user', password: 'wrong' })
    if (r.status === 429) { rateLimited = true; break }
  }
  check('Login rate limited after 10 attempts', rateLimited, rateLimited ? 'got 429' : 'never hit 429 after 12 attempts')

  // ── 9. Unauthenticated menu access blocked ────────────────────────────────
  console.log('\n9. Unauthenticated access blocked...')
  const menuNoAuth = await api('GET', '/menu', null)
  check('GET /menu without token → 401', menuNoAuth.status === 401, `status=${menuNoAuth.status}`)

  const staffNoAuth = await api('GET', '/staff/cashiers', null)
  check('GET /staff/cashiers without token → 401', staffNoAuth.status === 401, `status=${staffNoAuth.status}`)

  // ── 10. Settings isolation ────────────────────────────────────────────────
  console.log('\n10. Settings isolation...')
  await api('PUT', '/settings', tokenA, { restaurant_name: 'Tenant-A-Restaurant' })
  const settingsA = await api('GET', '/settings', tokenA)
  const settingsB = await api('GET', '/settings', tokenB)
  check('A sees own restaurant name', settingsA.body?.settings?.restaurant_name === 'Tenant-A-Restaurant', settingsA.body?.settings?.restaurant_name)
  check("B does not see A's restaurant name", settingsB.body?.settings?.restaurant_name !== 'Tenant-A-Restaurant', settingsB.body?.settings?.restaurant_name || '(empty)')

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log('═══════════════════════════════════════\n')

  if (failed > 0) process.exit(1)
})().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
