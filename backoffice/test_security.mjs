import { chromium } from 'playwright'

const BASE = 'https://restaurantpos-8xew.onrender.com'
const API  = BASE

const browser = await chromium.launch({ headless: true })
const ctx     = await browser.newContext()
const page    = await ctx.newPage()

let passed = 0
let failed = 0
function ok (label, val) {
  if (val) { console.log(`  PASS  ${label}`); passed++ }
  else      { console.log(`  FAIL  ${label}`); failed++ }
}

async function api (method, path, body, token) {
  const r = await page.request.fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    data: body ? JSON.stringify(body) : undefined,
    failOnStatusCode: false,
  })
  const json = await r.json().catch(() => ({}))
  return { status: r.status(), json }
}

// ── 0. Unlock main test account if it was accidentally locked by a prior run ──
console.log('[0] Pre-flight: ensure test account is not locked...')
const ownerLogin0 = await api('POST', '/owner/login', { username: 'mkhalid', password: 'MK@Owner2024!' })
const ownerPortalToken0 = ownerLogin0.json.token
const brands0 = ownerLogin0.json.brands || []
if (ownerPortalToken0 && brands0.length) {
  // Get BO users and unlock chillzoneice218 if locked
  const switchR = await api('POST', `/owner/switch/${brands0[0].brand_id}`, {}, ownerPortalToken0)
  const switchToken = switchR.json.token
  if (switchToken) {
    const usersR0 = await api('GET', '/config/users', null, switchToken)
    const locked = (usersR0.json.rows || []).find(u => u.username === 'chillzoneice218')
    if (locked?.id) {
      await api('PUT', `/config/users/${locked.id}`, { unlock_account: true }, switchToken)
      console.log('  unlocked chillzoneice218')
    }
  }
}
await new Promise(r => setTimeout(r, 1000))

// ── 1. BO login ───────────────────────────────────────────────────────────────
console.log('[1] BO login — valid credentials...')
const login1 = await api('POST', '/auth/login', { username: 'chillzoneice218', password: 'PWDPU782!' })
ok('login 200',               login1.status === 200)
ok('token present',           !!login1.json.token)
ok('refresh token present',   !!login1.json.refresh)
ok('app_access in response',  typeof login1.json.user?.app_access === 'object')
const ownerToken = login1.json.token
const refresh1   = login1.json.refresh

// ── 2. Refresh token rotation ─────────────────────────────────────────────────
console.log('[2] Refresh token rotation...')
const ref1 = await api('POST', '/auth/refresh', { refresh: refresh1 })
ok('refresh 200',             ref1.status === 200)
ok('new access token',        !!ref1.json.token)
ok('new refresh token',       !!ref1.json.refresh)
const ref2 = await api('POST', '/auth/refresh', { refresh: refresh1 })
ok('old refresh revoked 401', ref2.status === 401)

// ── 3. Password complexity — letters + numbers required ───────────────────────
console.log('[3] Password complexity enforcement...')
const allLetters = await api('POST', '/config/users', { username: 'cplx_t1', password: 'AbcdEfgh' }, ownerToken)
ok('all-letters password rejected (400)', allLetters.status === 400)
const allNums = await api('POST', '/config/users', { username: 'cplx_t2', password: '12345678' }, ownerToken)
ok('all-numbers password rejected (400)', allNums.status === 400)
const tooShort = await api('POST', '/config/users', { username: 'cplx_t3', password: 'Abc123!' }, ownerToken)
ok('7-char password rejected (400)',      tooShort.status === 400)
// Valid password
const validPwd = await api('POST', '/config/users', {
  username: 'cplx_testvalid',
  password: 'Secure99!',
  app_access: { pos: false, captain_app: false, kds: false, backoffice: true, owner_app: false },
  permissions: {},
}, ownerToken)
ok('valid password accepted (200 or 409)', validPwd.status === 200 || validPwd.status === 409)

// ── 4. Signup password complexity ─────────────────────────────────────────────
console.log('[4] Signup password validation...')
const signupWeak  = await api('POST', '/auth/signup', { email: 'cplx@x.com', password: 'letters' })
ok('signup all-letters rejected (400)',  signupWeak.status === 400)
const signupShort = await api('POST', '/auth/signup', { email: 'cplx@x.com', password: 'Ab1234' })
ok('signup 6-char rejected (400)',       signupShort.status === 400)
const signupNoNum = await api('POST', '/auth/signup', { email: 'cplx@x.com', password: 'Abcdefgh' })
ok('signup no-number rejected (400)',    signupNoNum.status === 400)

// ── 5. Account lockout on a throwaway user ────────────────────────────────────
console.log('[5] Account lockout (throwaway account)...')
// Ensure locktest user exists
await api('POST', '/config/users', { username: 'locktest_user', password: 'LockTest1!', permissions: {}, app_access: { backoffice: true } }, ownerToken)
// Send 5 wrong passwords
for (let i = 0; i < 5; i++) {
  await api('POST', '/auth/login', { username: 'locktest_user', password: 'Wrong' + i })
}
const lockedR = await api('POST', '/auth/login', { username: 'locktest_user', password: 'LockTest1!' })
ok('account locked after 5 failures (423)', lockedR.status === 423)
// Owner unlocks it
const lockedUser = (await api('GET', '/config/users', null, ownerToken)).json.rows?.find(u => u.username === 'locktest_user')
if (lockedUser) {
  const unlockR = await api('PUT', `/config/users/${lockedUser.id}`, { unlock_account: true }, ownerToken)
  ok('owner unlock returns 200', unlockR.status === 200)
  const afterUnlock = await api('POST', '/auth/login', { username: 'locktest_user', password: 'LockTest1!' })
  ok('login works after unlock', afterUnlock.status === 200)
}

// ── 6. Owner portal DELETE — is_protected guard ───────────────────────────────
console.log('[6] Owner portal DELETE — protected user blocked...')
const ownerLogin = await api('POST', '/owner/login', { username: 'mkhalid', password: 'MK@Owner2024!' })
ok('owner portal login 200', ownerLogin.status === 200)
const ownerPortalToken = ownerLogin.json.token
const brands = ownerLogin.json.brands || []
if (ownerPortalToken && brands.length) {
  const brandId = brands[0].brand_id
  const ouR = await api('GET', `/owner/brands/${brandId}/users`, null, ownerPortalToken)
  ok('owner GET users 200', ouR.status === 200)
  const protectedUser = (ouR.json.rows || []).find(u => u.is_protected)
  if (protectedUser) {
    const delR = await api('DELETE', `/owner/brands/${brandId}/users/${protectedUser.id}`, null, ownerPortalToken)
    ok('owner portal DELETE protected → 403', delR.status === 403)
  } else {
    console.log('  SKIP  no protected user in brand')
  }
}

// ── 7. Force-logout endpoint ──────────────────────────────────────────────────
console.log('[7] Force-logout endpoint...')
const cplxLogin = await api('POST', '/auth/login', { username: 'cplx_testvalid', password: 'Secure99!' })
if (cplxLogin.status === 200) {
  const cplxId      = cplxLogin.json.user?.id
  const cplxRefresh = cplxLogin.json.refresh
  const forceR = await api('DELETE', `/config/users/${cplxId}/sessions`, null, ownerToken)
  ok('force-logout 200', forceR.status === 200)
  const afterForce = await api('POST', '/auth/refresh', { refresh: cplxRefresh })
  ok('refresh after force-logout → 401', afterForce.status === 401)
} else {
  console.log('  SKIP  cplx_testvalid login failed')
}

// ── 8. /owner/switch has app_access ──────────────────────────────────────────
console.log('[8] /owner/switch token includes app_access...')
if (ownerPortalToken && brands.length) {
  const sw = await api('POST', `/owner/switch/${brands[0].brand_id}`, {}, ownerPortalToken)
  ok('switch 200', sw.status === 200)
  if (sw.json.token) {
    const payload = JSON.parse(Buffer.from(sw.json.token.split('.')[1], 'base64url').toString())
    ok('switch token has app_access',  typeof payload.app_access === 'object')
    ok('switch token backoffice=true', payload.app_access?.backoffice === true)
  }
}

// ── 9. app_access gate ────────────────────────────────────────────────────────
console.log('[9] app_access gate — backoffice=false blocked...')
await api('POST', '/config/users', {
  username: 'sec_noaccess',
  password: 'NoAccess1!',
  app_access: { pos: true, captain_app: false, kds: false, backoffice: false, owner_app: false },
  permissions: {},
}, ownerToken)
const loginNA = await api('POST', '/auth/login', { username: 'sec_noaccess', password: 'NoAccess1!' })
if (loginNA.status === 200 && loginNA.json.token) {
  const blocked = await api('GET', '/config/users', null, loginNA.json.token)
  ok('backoffice=false blocked 403', blocked.status === 403)
} else {
  console.log('  SKIP  sec_noaccess already exists with different password')
}

// ── 10. Config DELETE protected owner blocked ─────────────────────────────────
console.log('[10] Config DELETE protected owner cannot be disabled...')
const usersR = await api('GET', '/config/users', null, ownerToken)
ok('GET /config/users 200', usersR.status === 200)
const protUser = (usersR.json.rows || []).find(u => u.is_protected)
if (protUser) {
  const delR2 = await api('DELETE', `/config/users/${protUser.id}`, null, ownerToken)
  ok('DELETE protected owner → 400/403', delR2.status === 400 || delR2.status === 403)
}

// ── 11. owner_app UI description ─────────────────────────────────────────────
console.log('[11] owner_app UI description updated...')
await page.goto(`${BASE}/backoffice/index.html`)
await page.waitForTimeout(3000)
ok('owner_app says "separate login"', (await page.content()).includes('separate login'))

// ── Summary ───────────────────────────────────────────────────────────────────
await browser.close()
console.log(`\n${'─'.repeat(50)}`)
console.log(`PASSED: ${passed}  FAILED: ${failed}`)
if (failed) process.exit(1)
