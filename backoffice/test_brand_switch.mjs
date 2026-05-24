import { chromium } from 'playwright'

const BASE = 'https://restaurantpos-8xew.onrender.com'
const browser = await chromium.launch({ headless: false, slowMo: 500 })
const page = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

page.on('response', res => {
  const s = res.status()
  if (s >= 400 && !res.url().includes('favicon')) console.log(`  HTTP ${s}: ${res.url().replace(BASE,'')}`)
})

// ── Login to owner portal ─────────────────────────────────────────
console.log('[1] Login as mkhalid...')
await page.goto(`${BASE}/backoffice/owner.html`)
await page.waitForSelector('#auth', { state: 'visible', timeout: 30000 })
await page.fill('#inp-user', 'mkhalid')
await page.fill('#inp-pass', 'MK@Owner2024!')
await page.click('#btn-login')
await page.waitForSelector('#app', { state: 'visible', timeout: 15000 })
await page.waitForTimeout(2000)
console.log('    Owner dashboard loaded')

// ── Scroll to brand cards ─────────────────────────────────────────
await page.evaluate(() => window.scrollTo(0, 900))
await page.waitForTimeout(800)
await page.screenshot({ path: './sw_01_brand_cards.png' })

const btns = await page.locator('button:has-text("Open Brand Backoffice")').all()
console.log(`\n[2] Found ${btns.length} brand-switch buttons`)

// ── Switch Brand 1 (Chill Zone) ───────────────────────────────────
console.log('\n[3] Clicking Chill Zone "Open Brand Backoffice"...')
const [tab1] = await Promise.all([
  page.context().waitForEvent('page'),
  btns[0].click()
])
await tab1.setViewportSize({ width: 1440, height: 900 })
await tab1.waitForLoadState('domcontentloaded')
await tab1.waitForTimeout(6000)
await tab1.screenshot({ path: './sw_02_chill_zone_bo.png' })

const tab1Auth  = await tab1.isVisible('#auth-screen')
const tab1App   = await tab1.isVisible('#app')
const tab1Title = await tab1.title()
const tab1Brand = await tab1.textContent('#hdr-name').catch(() => 'N/A')
console.log(`    Title:         ${tab1Title}`)
console.log(`    Brand header:  ${tab1Brand}`)
console.log(`    Auth screen:   ${tab1Auth}  (should be false)`)
console.log(`    App visible:   ${tab1App}   (should be true)`)
console.log(`    RESULT: ${tab1App && !tab1Auth ? 'PASS — logged in directly' : 'FAIL — still on login screen'}`)

// ── Switch Brand 2 (Burger Rush) ─────────────────────────────────
console.log('\n[4] Clicking Burger Rush "Open Brand Backoffice"...')
await page.bringToFront()
const [tab2] = await Promise.all([
  page.context().waitForEvent('page'),
  btns[1].click()
])
await tab2.setViewportSize({ width: 1440, height: 900 })
await tab2.waitForLoadState('domcontentloaded')
await tab2.waitForTimeout(6000)
await tab2.screenshot({ path: './sw_03_burger_rush_bo.png' })

const tab2Auth  = await tab2.isVisible('#auth-screen')
const tab2App   = await tab2.isVisible('#app')
const tab2Title = await tab2.title()
const tab2Brand = await tab2.textContent('#hdr-name').catch(() => 'N/A')
console.log(`    Title:         ${tab2Title}`)
console.log(`    Brand header:  ${tab2Brand}`)
console.log(`    Auth screen:   ${tab2Auth}  (should be false)`)
console.log(`    App visible:   ${tab2App}   (should be true)`)
console.log(`    RESULT: ${tab2App && !tab2Auth ? 'PASS — logged in directly' : 'FAIL — still on login screen'}`)

// ── Summary ───────────────────────────────────────────────────────
console.log('\n=== SUMMARY ===')
console.log(`Chill Zone switch:   ${tab1App && !tab1Auth ? 'PASS' : 'FAIL'}`)
console.log(`Burger Rush switch:  ${tab2App && !tab2Auth ? 'PASS' : 'FAIL'}`)

await browser.close()
