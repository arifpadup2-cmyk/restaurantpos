/**
 * Full POS test: setup → login → variant picker → modifier prompt → channel pricing → cart
 */
import { _electron as electron } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const posDir = path.resolve(__dir, '../pos')

// ── Inject a valid config so POS boots straight to login ──────────────────────
const cfgPath = process.env.APPDATA + '\\restaurant-pos\\pos-config.json'
const cfg = {
  serverIp: 'localhost', serverPort: '3003', machineId: 'POS-TEST-01',
  outletId: 'out-test-001', outletName: 'Main Branch',
  apiKey: 'pos-api-key-2026',
  dbHost: '127.0.0.1', dbPort: '5432',
  dbName: 'restaurant_pos_central', dbUser: 'pos_central_user',
  dbPass: 'CentralPos@2026', dbSsl: 'false',
  restaurantName: 'Test Brand', restaurantId: '', licenseKey: '',
}
fs.writeFileSync(cfgPath, JSON.stringify(cfg), 'utf8')
console.log('Config written (no BOM).')

// ── Launch ────────────────────────────────────────────────────────────────────
const app = await electron.launch({
  executablePath: path.resolve(posDir, 'node_modules/electron/dist/electron.exe'),
  args: [posDir],
  cwd:  posDir,
  env:  { ...process.env, ELECTRON_IS_DEV: '0' },
})

const page = await app.firstWindow()
page.on('pageerror', err => console.error('  [PAGEERROR]', String(err).slice(0, 200)))
page.on('console',  m  => { if (m.type() === 'error') console.error('  [error]', m.text().slice(0, 150)) })

// ── 1. Boot state ─────────────────────────────────────────────────────────────
await page.waitForTimeout(5000)
await page.screenshot({ path: 'pos_test_01_boot.png' })

const loginVisible = await page.evaluate(() =>
  window.getComputedStyle(document.getElementById('screen-login')).display !== 'none')
const setupVisible = await page.evaluate(() =>
  window.getComputedStyle(document.getElementById('screen-setup')).display !== 'none')

console.log(`\n── Boot state ──`)
console.log(`  login visible:  ${loginVisible}`)
console.log(`  setup visible:  ${setupVisible}`)

if (setupVisible) {
  console.log('  Setup screen showing — config or DB issue. Aborting.')
  await page.screenshot({ path: 'pos_test_00_setup_error.png' })
  await app.close(); process.exit(1)
}
if (!loginVisible) {
  console.log('  Neither login nor setup visible. Aborting.')
  await app.close(); process.exit(1)
}

const outletName = await page.evaluate(() => document.getElementById('login-outlet-name')?.textContent)
console.log(`  Outlet: "${outletName}"`)

// ── 2. Migrations ran? Check order_items columns ──────────────────────────────
console.log(`\n── Migration check ──`)
const hasVariantCol = await page.evaluate(async () => {
  const r = await window.posAPI.db.all(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='order_items' AND column_name='variant_name'`)
  return r.ok && r.data.length > 0
})
const hasModifiersCol = await page.evaluate(async () => {
  const r = await window.posAPI.db.all(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='order_items' AND column_name='modifiers'`)
  return r.ok && r.data.length > 0
})
const hasItemVariantsTable = await page.evaluate(async () => {
  const r = await window.posAPI.db.all(`
    SELECT to_regclass('public.item_variants') AS t`)
  return r.ok && r.data[0]?.t != null
})
console.log(`  order_items.variant_name:  ${hasVariantCol ? '✓' : '✗ MISSING'}`)
console.log(`  order_items.modifiers:     ${hasModifiersCol ? '✓' : '✗ MISSING'}`)
console.log(`  item_variants table:       ${hasItemVariantsTable ? '✓' : '✗ MISSING'}`)

// ── 3. Login with first cashier ───────────────────────────────────────────────
console.log(`\n── Login ──`)
const cashiers = await page.evaluate(async () => {
  const r = await window.posAPI.db.all('SELECT id, name, pin, role FROM cashiers WHERE active=1 LIMIT 5')
  return r.ok ? r.data : []
})
console.log(`  Cashiers found: ${cashiers.length}`)
cashiers.forEach(c => console.log(`    - ${c.name} (role:${c.role}, pin:${c.pin})`))

if (!cashiers.length) {
  console.log('  No cashiers — cannot test login. Aborting.')
  await app.close(); process.exit(1)
}

const pin = cashiers[0].pin
for (const k of pin.split('')) {
  await page.evaluate(k => pinKey(k), k)
  await page.waitForTimeout(150)
}
await page.waitForTimeout(2000)
await page.screenshot({ path: 'pos_test_02_after_pin.png' })

const cashBoxVisible = await page.evaluate(() => document.getElementById('cash-box')?.classList.contains('show'))
const appVisible     = await page.evaluate(() => window.getComputedStyle(document.getElementById('app')).display !== 'none')
console.log(`  cash-box shown: ${cashBoxVisible}`)
console.log(`  app visible:    ${appVisible}`)

if (cashBoxVisible) {
  console.log('  Opening cash entry → starting shift with RM 100')
  await page.evaluate(() => { document.getElementById('login-cash').value = '100' })
  await page.evaluate(() => startShift())
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'pos_test_03_pos_main.png' })
  console.log('  Shot: POS main screen')
}

const posReady = await page.evaluate(() => window.getComputedStyle(document.getElementById('app')).display !== 'none')
console.log(`  POS ready: ${posReady}`)
if (!posReady) { console.log('POS did not open.'); await app.close(); process.exit(1) }

// ── 4. Menu state ─────────────────────────────────────────────────────────────
console.log(`\n── Menu state ──`)
await page.waitForTimeout(1000)
const menuStats = await page.evaluate(() => {
  return {
    totalItems:      window.menu?.items?.length ?? 0,
    withVariants:    window.menu?.items?.filter(i => i.variants?.length).length ?? 0,
    withModGroups:   window.menu?.items?.filter(i => i.mod_groups?.length).length ?? 0,
    categories:      window.menu?.categories?.length ?? 0,
    variantBadgeCount: document.querySelectorAll('.nitem-has-variants').length,
    modBadgeCount:     document.querySelectorAll('.nitem-has-mods').length,
  }
})
console.log(`  Items total:         ${menuStats.totalItems}`)
console.log(`  Items with variants: ${menuStats.withVariants}`)
console.log(`  Items with mod grps: ${menuStats.withModGroups}`)
console.log(`  Categories:          ${menuStats.categories}`)
console.log(`  ▾ badges on cards:   ${menuStats.variantBadgeCount}`)
console.log(`  ⊕ badges on cards:   ${menuStats.modBadgeCount}`)
await page.screenshot({ path: 'pos_test_04_menu.png' })

// ── 5. Channel pricing ────────────────────────────────────────────────────────
console.log(`\n── Channel pricing ──`)
const channelPriceTest = await page.evaluate(() => {
  // Find an item with dine_in_price set
  const itemWithChannelPrice = window.menu?.items?.find(i =>
    i.dine_in_price || i.takeaway_price || i.delivery_price || i.online_price)
  if (!itemWithChannelPrice) return { found: false }
  const basePrice    = parseFloat(itemWithChannelPrice.price)
  const dineinPrice  = itemWithChannelPrice.dine_in_price  ? parseFloat(itemWithChannelPrice.dine_in_price)  : null
  const takeawayPrice= itemWithChannelPrice.takeaway_price ? parseFloat(itemWithChannelPrice.takeaway_price) : null
  // Test getChannelPrice for dine-in
  window.cart.type = 'dine-in'
  const pDineIn  = getChannelPrice(itemWithChannelPrice)
  window.cart.type = 'takeaway'
  const pTakeaway = getChannelPrice(itemWithChannelPrice)
  window.cart.type = 'dine-in' // reset
  return { found: true, name: itemWithChannelPrice.name, basePrice, dineinPrice, takeawayPrice, pDineIn, pTakeaway }
})
if (channelPriceTest.found) {
  console.log(`  Item: "${channelPriceTest.name}"`)
  console.log(`  Base price:         ${channelPriceTest.basePrice}`)
  console.log(`  Dine-in price col:  ${channelPriceTest.dineinPrice ?? '(null → uses base)'}`)
  console.log(`  Takeaway price col: ${channelPriceTest.takeawayPrice ?? '(null → uses base)'}`)
  console.log(`  getChannelPrice dine-in:  ${channelPriceTest.pDineIn}`)
  console.log(`  getChannelPrice takeaway: ${channelPriceTest.pTakeaway}`)
} else {
  console.log('  No items with channel price overrides found (all use base price)')
}

// ── 6. Test variant picker ────────────────────────────────────────────────────
console.log(`\n── Variant picker ──`)
const itemWithVariants = await page.evaluate(() => window.menu?.items?.find(i => i.variants?.length > 0))
if (itemWithVariants) {
  console.log(`  Item with variants: "${itemWithVariants.name}" (${itemWithVariants.variants?.length} variants)`)
  itemWithVariants.variants?.forEach(v => console.log(`    - ${v.name}${v.size?' ('+v.size+')':''}: ${v.price}`))

  // Click the card
  await page.evaluate(item => addToCart(item), itemWithVariants)
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'pos_test_05_variant_picker.png' })

  const pickerVisible = await page.evaluate(() =>
    document.getElementById('modal-variant-picker')?.style.display !== 'none')
  console.log(`  Variant picker visible: ${pickerVisible}`)

  if (pickerVisible) {
    const variants = await page.evaluate(() =>
      [...document.querySelectorAll('#vp-list .vpick-item')].map(el => ({
        name:  el.querySelector('.vpick-name')?.textContent,
        price: el.querySelector('.vpick-price')?.textContent,
      }))
    )
    console.log(`  Picker shows ${variants.length} options:`)
    variants.forEach(v => console.log(`    - ${v.name}: ${v.price}`))

    // Click first variant
    await page.evaluate(() => {
      const first = document.querySelector('#vp-list .vpick-item')
      if (first) first.click()
    })
    await page.waitForTimeout(500)

    const pickerGone = await page.evaluate(() =>
      document.getElementById('modal-variant-picker')?.style.display === 'none')
    console.log(`  Picker dismissed after selection: ${pickerGone}`)

    // Check modifier prompt or cart
    const modPromptVisible = await page.evaluate(() =>
      document.getElementById('modal-modifier-prompt')?.style.display !== 'none')
    console.log(`  Modifier prompt opened next: ${modPromptVisible}`)

    if (modPromptVisible) {
      // Dismiss modifier prompt for now
      await page.evaluate(() => { document.getElementById('modal-modifier-prompt').style.display = 'none' })
      await page.evaluate(() => { window._pendingItem = null; window._pendingModSelections = {} })
      await page.waitForTimeout(300)
    }
  } else {
    // Maybe item went straight to cart (no variant picker shown — bug check)
    const cartHasItem = await page.evaluate(() => window.cart?.items?.length > 0)
    console.log(`  Picker NOT shown — item went directly to cart: ${cartHasItem} (may be a bug if item has variants)`)
  }
} else {
  console.log('  No items with variants in DB — skipping variant picker test')
  console.log('  (Add an item with variants via Back Office to test this flow)')
}

// ── 7. Test modifier prompt (standalone, no variant) ─────────────────────────
console.log(`\n── Modifier prompt ──`)
// Clear cart first
await page.evaluate(() => { window.cart.items = []; renderCart() })

const itemWithMods = await page.evaluate(() =>
  window.menu?.items?.find(i => i.mod_groups?.length > 0 && (!i.variants || !i.variants.length)))
if (itemWithMods) {
  console.log(`  Item with modifiers: "${itemWithMods.name}"`)
  itemWithMods.mod_groups?.forEach(g => {
    console.log(`    Group: "${g.name}" (required:${g.required}, max:${g.max_select})`)
    g.options?.forEach(o => console.log(`      - ${o.name}: +${o.price}`))
  })

  await page.evaluate(item => addToCart(item), itemWithMods)
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'pos_test_06_modifier_prompt.png' })

  const modVisible = await page.evaluate(() =>
    document.getElementById('modal-modifier-prompt')?.style.display !== 'none')
  console.log(`  Modifier prompt visible: ${modVisible}`)

  if (modVisible) {
    const groups = await page.evaluate(() =>
      [...document.querySelectorAll('.mpick-group')].map(g => ({
        title:    g.querySelector('.mpick-group-title')?.textContent?.trim(),
        optCount: g.querySelectorAll('.mpick-opt').length,
      }))
    )
    console.log(`  Groups rendered: ${groups.length}`)
    groups.forEach(g => console.log(`    - "${g.title}" (${g.optCount} opts)`))

    // Select first option in first group
    await page.evaluate(() => {
      const firstOpt = document.querySelector('.mpick-opt')
      if (firstOpt) firstOpt.click()
    })
    await page.waitForTimeout(200)
    const selected = await page.evaluate(() =>
      document.querySelectorAll('.mpick-opt.selected').length)
    console.log(`  Options selected: ${selected}`)

    // Confirm
    await page.evaluate(() => confirmModifiers())
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'pos_test_07_after_modifier.png' })

    const promptGone = await page.evaluate(() =>
      document.getElementById('modal-modifier-prompt')?.style.display === 'none')
    console.log(`  Prompt dismissed: ${promptGone}`)
  }
} else {
  console.log('  No standalone modifier items in DB — skipping')
  console.log('  (Add a modifier group and link to an item via Back Office to test this)')
}

// ── 8. Cart state with variant/modifier data ──────────────────────────────────
console.log(`\n── Cart state ──`)
// Add a plain item (no variants, no modifiers)
await page.evaluate(() => { window.cart.items = []; renderCart() })
const plainItem = await page.evaluate(() =>
  window.menu?.items?.find(i => (!i.variants || !i.variants.length) && (!i.mod_groups || !i.mod_groups.length)))

if (plainItem) {
  await page.evaluate(item => addToCart(item), plainItem)
  await page.waitForTimeout(400)
}

const cartState = await page.evaluate(() => ({
  itemCount: window.cart?.items?.length,
  items: window.cart?.items?.map(i => ({
    name:        i.name,
    price:       i.price,
    variantName: i.variantName,
    modifiers:   i.modifiers,
    qty:         i.qty,
  })),
}))
console.log(`  Cart items: ${cartState.itemCount}`)
cartState.items?.forEach(i => {
  console.log(`    - "${i.name}" qty:${i.qty} price:${i.price} variant:${i.variantName||'—'} mods:${JSON.stringify(i.modifiers||[])}`)
})
await page.screenshot({ path: 'pos_test_08_cart.png' })

// ── 9. Variant name shows in cart render ──────────────────────────────────────
const variantInDom = await page.evaluate(() =>
  document.querySelectorAll('.op-item-variant').length)
console.log(`  .op-item-variant elements in DOM: ${variantInDom}`)

// ── Done ──────────────────────────────────────────────────────────────────────
await page.screenshot({ path: 'pos_test_09_final.png' })
await app.close()
console.log('\n✓ Test complete.')
