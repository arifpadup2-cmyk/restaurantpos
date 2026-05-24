import { chromium } from 'playwright'

const BASE = 'https://restaurantpos-8xew.onrender.com'
const browser = await chromium.launch({ headless: false, slowMo: 300 })
const boPage = await browser.newPage()
await boPage.setViewportSize({ width: 1440, height: 900 })

boPage.on('response', res => {
  const s = res.status()
  if (s >= 400 && !res.url().includes('favicon')) console.log(`  HTTP ${s}: ${res.url().replace(BASE,'')}`)
})

// ── Helper: set Last Month + select first outlet + Generate ────────
async function runReport(label, file) {
  console.log(`  → ${label}`)
  await boPage.waitForTimeout(600)

  // Click the VISIBLE "This Month" preset button (each report section has one)
  await boPage.evaluate(() => {
    const btns = [...document.querySelectorAll('.rpt-preset-btn')]
    const visible = btns.find(b => b.textContent.trim() === 'This Month' && b.offsetParent !== null)
    if (visible) visible.click()
  })
  await boPage.waitForTimeout(500)

  // Select first real outlet in #rpt-outlet
  const outSel = boPage.locator('#rpt-outlet')
  if (await outSel.isVisible().catch(() => false)) {
    const opts = await outSel.locator('option').all()
    if (opts.length > 1) await outSel.selectOption({ index: 1 })
  }
  await boPage.waitForTimeout(300)

  // Click Generate
  const gen = boPage.locator('#rpt-generate-btn')
  if (await gen.isVisible().catch(() => false)) {
    await gen.click()
    await boPage.waitForTimeout(4000)
  } else {
    await boPage.waitForTimeout(2000)
  }
  await boPage.screenshot({ path: `./${file}` })
}

// ── 1. Login owner portal ─────────────────────────────────────────
const ownerPage = await browser.newPage()
await ownerPage.setViewportSize({ width: 1440, height: 900 })
console.log('[1] Login as mkhalid...')
await ownerPage.goto(`${BASE}/backoffice/owner.html`)
await ownerPage.waitForSelector('#auth', { state: 'visible', timeout: 30000 })
await ownerPage.fill('#inp-user', 'mkhalid')
await ownerPage.fill('#inp-pass', 'MK@Owner2024!')
await ownerPage.click('#btn-login')
await ownerPage.waitForSelector('#app', { state: 'visible', timeout: 15000 })
await ownerPage.waitForTimeout(2000)

// ── 2. Switch to Burger Rush ──────────────────────────────────────
console.log('[2] Switching to Burger Rush BO...')
await ownerPage.evaluate(() => window.scrollTo(0, 900))
await ownerPage.waitForTimeout(600)
const switchBtns = await ownerPage.locator('button:has-text("Open Brand Backoffice")').all()
const [newTab] = await Promise.all([
  ownerPage.context().waitForEvent('page'),
  switchBtns[1].click()
])
// Redirect to our boPage
await newTab.close()

// Use direct login for the boPage to avoid new-tab complexity
const boCreds = { username: 'chillzoneice218', password: 'PWDPU782!' }
await boPage.goto(`${BASE}/backoffice/index.html`)
await boPage.waitForSelector('#auth-screen', { state: 'visible', timeout: 15000 })
await boPage.fill('#auth-username', boCreds.username)
await boPage.fill('#auth-password', boCreds.password)
await boPage.click('button.btn-auth')
await boPage.waitForSelector('#app', { state: 'visible', timeout: 15000 })
await boPage.waitForTimeout(3000)
console.log(`    Brand: ${await boPage.textContent('#hdr-name').catch(() => '?')}`)

// ── 3. Open Reports ───────────────────────────────────────────────
console.log('[3] Opening Reports...')
await boPage.click('#nav-reports')
await boPage.waitForTimeout(1500)

// ── 4. Run each report tab ────────────────────────────────────────
const tabs = [
  { id: 'navsub-rpt-sales',           label: 'Day Summary',          file: 'cz_rpt_01_day_summary.png' },
  { id: 'navsub-rpt-item-sales',      label: 'Item Report',          file: 'cz_rpt_02_item_report.png', chipOnly: true },
  { id: 'navsub-rpt-consumption',     label: 'Item Consumption',     file: 'cz_rpt_03_item_consumption.png' },
  { id: 'navsub-rpt-cashier',         label: 'Cashier Performance',  file: 'cz_rpt_04_cashier.png' },
  { id: 'navsub-rpt-voids',           label: 'Voids & Discounts',    file: 'cz_rpt_05_voids.png' },
  { id: 'navsub-rpt-expenses',        label: 'Expenses',             file: 'cz_rpt_06_expenses.png' },
  { id: 'navsub-rpt-canceled-items',  label: 'Canceled Items',       file: 'cz_rpt_07_canceled_items.png' },
  { id: 'navsub-rpt-canceled-bills',  label: 'Canceled Bills',       file: 'cz_rpt_08_canceled_bills.png' },
  { id: 'navsub-rpt-wastage',         label: 'Wastage',              file: 'cz_rpt_09_wastage.png' },
  { id: 'navsub-rpt-comp-bills',      label: 'Complementary Bills',  file: 'cz_rpt_10_comp_bills.png' },
  { id: 'navsub-rpt-security',        label: 'Audit & Security',     file: 'cz_rpt_11_audit.png' },
]

console.log('[4] Running reports...')
for (const tab of tabs) {
  const el = boPage.locator(`#${tab.id}`)
  const vis = await el.isVisible().catch(() => false)
  if (!vis) { console.log(`  SKIP: ${tab.label}`); continue }
  await el.click()
  await boPage.waitForTimeout(600)

  if (tab.chipOnly) {
    // Item Report: period chips trigger load directly, no Generate button
    console.log(`  → ${tab.label} (chip-based)`)
    await boPage.evaluate(() => {
      const btns = [...document.querySelectorAll('.rpt-preset-btn')]
      const visible = btns.find(b => b.textContent.trim() === 'This Month' && b.offsetParent !== null)
      if (visible) visible.click()
    })
    await boPage.waitForTimeout(3500)
    await boPage.screenshot({ path: `./${tab.file}` })
  } else {
    await runReport(tab.label, tab.file)
  }
}

await browser.close()
console.log('\nAll reports done.')
