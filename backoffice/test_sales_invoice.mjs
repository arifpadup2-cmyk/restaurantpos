import { chromium } from 'playwright'

const BASE = 'https://restaurantpos-8xew.onrender.com'
const browser = await chromium.launch({ headless: false, slowMo: 400 })
const page = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

page.on('response', res => {
  const s = res.status()
  if (s >= 400 && !res.url().includes('favicon')) console.log(`  HTTP ${s}: ${res.url().replace(BASE,'')}`)
})

// Login as chillzoneice218
console.log('[1] Login as chillzoneice218...')
await page.goto(`${BASE}/backoffice/index.html`)
await page.waitForSelector('#auth-screen', { state: 'visible', timeout: 20000 })
await page.fill('#auth-username', 'chillzoneice218')
await page.fill('#auth-password', 'PWDPU782!')
await page.click('button.btn-auth')
await page.waitForSelector('#app', { state: 'visible', timeout: 15000 })
await page.waitForTimeout(3000)
console.log(`    Brand: ${await page.textContent('#hdr-name').catch(() => '?')}`)

// Open Sales Invoice (= #nav-orders → showView('orders') → #v-orders)
console.log('[2] Opening Sales Invoice report...')
await page.click('#nav-reports')
await page.waitForTimeout(800)
await page.click('#nav-orders')
await page.waitForTimeout(2000)
await page.screenshot({ path: './si_01_landed.png' })

// Select outlet
console.log('[3] Selecting outlet...')
const outSel = page.locator('#orders-outlet')
if (await outSel.isVisible().catch(() => false)) {
  const opts = await outSel.locator('option').all()
  console.log(`    Outlet options: ${opts.length}`)
  if (opts.length > 1) { await outSel.selectOption({ index: 1 }); console.log('    Outlet selected') }
  await page.waitForTimeout(2000)
}
await page.screenshot({ path: './si_02_outlet_selected.png' })

// Set This Month — orders section uses setOrdersPreset, class rpt-preset-btn
console.log('[4] Setting This Month...')
await page.evaluate(() => {
  // Find visible rpt-preset-btn with text "This Month" inside #v-orders
  const ordersView = document.querySelector('#v-orders')
  if (ordersView) {
    const btn = [...ordersView.querySelectorAll('.rpt-preset-btn')].find(b => b.textContent.trim() === 'This Month')
    if (btn) { btn.click(); console.log('clicked This Month in #v-orders') }
  }
})
await page.waitForTimeout(4000)
await page.screenshot({ path: './si_03_this_month.png' })

// Check row count
const rowCount = await page.evaluate(() => {
  const tbody = document.querySelector('#orders-tbody')
  return tbody ? tbody.querySelectorAll('tr').length : -1
})
console.log(`    Row count in #orders-tbody: ${rowCount}`)

// Scroll to see table rows
await page.evaluate(() => window.scrollTo(0, 400))
await page.waitForTimeout(600)
await page.screenshot({ path: './si_03_rows.png' })

// Click first invoice row
console.log('[5] Clicking first invoice...')
const firstRow = page.locator('#orders-tbody tr').first()
const rowVis = await firstRow.isVisible().catch(() => false)
if (rowVis) {
  await firstRow.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: './si_04_invoice_detail.png' })
  console.log('    Invoice detail opened')
} else {
  console.log('    No rows in #orders-tbody')
  // Check if there is any empty-state message
  const emptyMsg = await page.evaluate(() => {
    const el = document.querySelector('#v-orders .empty-state, #v-orders .no-data, #v-orders td[colspan]')
    return el ? el.textContent.trim() : null
  })
  console.log(`    Empty state: ${emptyMsg}`)
  await page.screenshot({ path: './si_04_invoice_detail.png' })
}

await browser.close()
console.log('\nDone.')
