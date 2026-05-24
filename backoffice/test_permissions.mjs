import { chromium } from 'playwright'

const BASE = 'https://restaurantpos-8xew.onrender.com'
const browser = await chromium.launch({ headless: false, slowMo: 200 })
const page    = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

page.on('response', res => {
  const s = res.status()
  if (s >= 400 && !res.url().includes('favicon')) console.log(`  HTTP ${s}: ${res.url().replace(BASE,'')}`)
})

// ── 1. Login as owner ────────────────────────────────────────────────────────
console.log('[1] Login as chillzoneice218 (owner)...')
await page.goto(`${BASE}/backoffice/index.html`)
await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 20000 })
await page.fill('#auth-username', 'chillzoneice218')
await page.fill('#auth-password', 'PWDPU782!')
await page.click('button.btn-auth')
await page.waitForSelector('#app', { state: 'visible', timeout: 15000 })
await page.waitForTimeout(2000)
console.log(`  Brand: ${await page.textContent('#hdr-name').catch(() => '?')}`)
await page.screenshot({ path: './perm_01_owner_nav.png' })

// ── 2. Open BO Users tab ─────────────────────────────────────────────────────
console.log('[2] Opening BO Users tab...')
await page.evaluate(() => document.querySelector('#navg-config')?.click())
await page.waitForTimeout(600)
const bouNav = page.locator('#navsub-bo-users')
await bouNav.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
await bouNav.click().catch(async () => {
  await page.evaluate(() => document.querySelector('#navsub-bo-users')?.click())
})
await page.waitForTimeout(2000)
await page.screenshot({ path: './perm_02_bo_users_tab.png' })
console.log(`  BO Users section visible: ${await page.isVisible('#cfg-bo-users')}`)

// ── 3. Click Add User — check new modal sections ─────────────────────────────
console.log('[3] Opening Add User modal...')
await page.click('#cfg-bo-users-add-btn')
await page.waitForTimeout(800)
await page.screenshot({ path: './perm_03_add_user_modal.png' })

// Check all sections present
const hasCopyFrom   = await page.isVisible('select[onchange^="bouCopyFromUser"]')
const hasDesig      = await page.isVisible('#bou-designation')
const hasPOSCard    = await page.isVisible('#bou-app-pos')
const hasBOCard     = await page.isVisible('#bou-app-backoffice')
const hasBOPerms    = await page.isVisible('#bou-bo-perms-section')
const hasOutlets    = await page.locator('.bou-outlet-cb').count()
console.log(`  Copy-from dropdown: ${hasCopyFrom}  (expect true if users exist)`)
console.log(`  Designation dropdown: ${hasDesig}  (expect true)`)
console.log(`  POS app card: ${hasPOSCard}  (expect true)`)
console.log(`  Backoffice app card: ${hasBOCard}  (expect true)`)
console.log(`  BO perms section visible (backoffice on): ${hasBOPerms}  (expect true)`)
console.log(`  Outlet checkboxes: ${hasOutlets}`)

// ── 4. Toggle POS on, verify card highlights ──────────────────────────────────
console.log('[4] Toggling POS app access on...')
const posCard = page.locator('#bou-app-lbl-pos')
const posState0 = await page.evaluate(() => document.getElementById('bou-app-pos')?.checked)
console.log(`  POS checked before click: ${posState0}`)
await posCard.click()
await page.waitForTimeout(300)
const posState1 = await page.evaluate(() => document.getElementById('bou-app-pos')?.checked)
console.log(`  POS checked after click: ${posState1}  (expect ${!posState0})`)
await page.screenshot({ path: './perm_04_pos_toggled.png' })

// ── 5. Toggle Back Office OFF — BO perms section should hide ──────────────────
console.log('[5] Toggling Back Office OFF — BO perms should hide...')
const boCard = page.locator('#bou-app-lbl-backoffice')
await boCard.click()
await page.waitForTimeout(300)
const boOn = await page.evaluate(() => document.getElementById('bou-app-backoffice')?.checked)
const boPermsVisible = await page.isVisible('#bou-bo-perms-section')
console.log(`  Backoffice checked: ${boOn}  (expect false)`)
console.log(`  BO perms section visible: ${boPermsVisible}  (expect false)`)
await page.screenshot({ path: './perm_05_bo_perms_hidden.png' })

// Toggle back ON
await boCard.click()
await page.waitForTimeout(300)

// ── 6. Fill form and create limited staff user ────────────────────────────────
console.log('[6] Creating limited staff user teststaff002...')
await page.fill('#bou-name',     'Test Staff Two')
await page.fill('#bou-username', 'teststaff002')
await page.fill('#bou-password', 'Staff@123!')
// Select first outlet
const outletCbs = await page.locator('.bou-outlet-cb').all()
if (outletCbs.length > 0) await outletCbs[0].check()
// Grant only view_reports + view_sales_invoice
await page.locator('.bou-perm-cb[data-pkey="view_reports"]').check()
await page.locator('.bou-perm-cb[data-pkey="view_sales_invoice"]').check()
// Make sure POS is on (we toggled it)
const posNow = await page.evaluate(() => document.getElementById('bou-app-pos')?.checked)
if (!posNow) {
  await page.locator('#bou-app-lbl-pos').click()
  await page.waitForTimeout(200)
}
await page.screenshot({ path: './perm_06_form_filled.png' })
await page.locator('#modal-bo-user button:has-text("Save User")').click()
await page.waitForTimeout(2000)
await page.screenshot({ path: './perm_07_after_save.png' })
console.log(`  Modal closed: ${!(await page.isVisible('#modal-bo-user'))}  (expect true)`)

// ── 7. Find saved user, check designation + app_access shown in card ──────────
console.log('[7] Checking user card shows app tags...')
await page.waitForTimeout(1000)
const cardText = await page.locator('#cfg-bo-users-list').textContent().catch(() => '')
const hasPOSTag = cardText.includes('POS') || cardText.includes('Backoffice')
console.log(`  Card shows app tags: ${hasPOSTag}  (expect true)`)
await page.screenshot({ path: './perm_08_user_list.png' })

// ── 8. Edit the user — copy-from should NOT appear, fields pre-filled ─────────
console.log('[8] Edit user modal pre-fill check...')
const editBtn = page.locator('button:has-text("Edit")').first()
await editBtn.click()
await page.waitForTimeout(800)
const editName = await page.inputValue('#bou-name').catch(() => '')
const editUser = await page.inputValue('#bou-username').catch(() => '')
const copyVisible = await page.isVisible('select[onchange^="bouCopyFromUser"]')
console.log(`  Edit name pre-filled: "${editName}"  (expect "Test Staff Two")`)
console.log(`  Edit username pre-filled: "${editUser}"  (expect "teststaff002")`)
console.log(`  Copy-from hidden on edit: ${!copyVisible}  (expect true)`)
await page.screenshot({ path: './perm_09_edit_modal.png' })
await page.locator('#modal-bo-user button:has-text("Save User")').click()
await page.waitForTimeout(1500)

// ── 9. Login as teststaff002 — verify nav restrictions ───────────────────────
console.log('[9] Login as teststaff002 (limited)...')
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.goto(`${BASE}/backoffice/index.html`)
await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 20000 })
await page.fill('#auth-username', 'teststaff002')
await page.fill('#auth-password', 'Staff@123!')
await page.click('button.btn-auth')
await page.waitForSelector('#app', { state: 'visible', timeout: 15000 })
await page.waitForTimeout(2500)

const staffNavReports = await page.isVisible('#nav-reports')
const staffNavConfig  = await page.isVisible('#navg-config')
const staffNavBoUsers = await page.isVisible('#navsub-bo-users')
console.log(`  nav-reports: ${staffNavReports}  (expect true — has view_reports)`)
console.log(`  navg-config: ${staffNavConfig}  (expect false — no manage_config)`)
console.log(`  navsub-bo-users: ${staffNavBoUsers}  (expect false — no manage_users)`)
await page.screenshot({ path: './perm_10_staff_nav.png' })

// ── 10. Owner portal — user management modal ─────────────────────────────────
console.log('[10] Owner portal user management...')
const ownerPage = await browser.newPage()
await ownerPage.setViewportSize({ width: 1440, height: 900 })
await ownerPage.goto(`${BASE}/backoffice/owner.html`)
await ownerPage.waitForSelector('#auth', { state: 'visible', timeout: 20000 })
await ownerPage.fill('#inp-user', 'mkhalid')
await ownerPage.fill('#inp-pass', 'MK@Owner2024!')
await ownerPage.click('#btn-login')
await ownerPage.waitForSelector('#app', { state: 'visible', timeout: 15000 })
await ownerPage.waitForTimeout(3000)
await ownerPage.evaluate(() => window.scrollTo(0, 900))
await ownerPage.waitForTimeout(800)

const usersBtn = ownerPage.locator('button:has-text("Users")').first()
if (await usersBtn.isVisible().catch(() => false)) {
  await usersBtn.click()
  await ownerPage.waitForTimeout(2000)
  await ownerPage.screenshot({ path: './perm_11_owner_users_modal.png' })
  const rows = await ownerPage.locator('#modal-user-mgmt tbody tr').count().catch(() => 0)
  console.log(`  User rows: ${rows}`)

  // Open Add User form
  await ownerPage.click('button:has-text("+ Add User")')
  await ownerPage.waitForTimeout(800)
  await ownerPage.screenshot({ path: './perm_12_owner_add_form.png' })
  const ownerHasDesig   = await ownerPage.isVisible('#ouf-designation')
  const ownerHasPOSCard = await ownerPage.isVisible('#ouf-app-pos')
  const ownerHasBOPerms = await ownerPage.isVisible('#ouf-bo-perms-section')
  console.log(`  Owner form - Designation: ${ownerHasDesig}  (expect true)`)
  console.log(`  Owner form - POS card: ${ownerHasPOSCard}  (expect true)`)
  console.log(`  Owner form - BO perms section: ${ownerHasBOPerms}  (expect true)`)

  // Toggle POS ON
  await ownerPage.locator('#ouf-app-lbl-pos').click()
  await ownerPage.waitForTimeout(300)
  const oufPosOn = await ownerPage.evaluate(() => document.getElementById('ouf-app-pos')?.checked)
  console.log(`  POS toggled ON: ${oufPosOn}  (expect true)`)
  await ownerPage.screenshot({ path: './perm_13_owner_pos_toggled.png' })
} else {
  console.log('  WARN: Users button not found')
  await ownerPage.screenshot({ path: './perm_11_owner_users_modal.png' })
}

await browser.close()
console.log('\nDone.')
