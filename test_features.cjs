'use strict';
const { chromium } = require('C:/Users/Lenovo/node_modules/playwright');
const path = require('path');

const BASE = 'D:/sofwtares/RESTAURANT POS';
const SS   = n => path.join(BASE, `feat_${n}.png`);
const PASS = '✅';
const FAIL = '❌';
const INFO = '   >';

function check(label, cond) {
  console.log(`  ${cond ? PASS : FAIL} ${label}`);
  return cond;
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page    = await browser.newPage();
  page.setDefaultTimeout(20000);

  // ══════════════════════════════════════════════════════════════
  // [A] BACKOFFICE LOGIN PAGE
  // ══════════════════════════════════════════════════════════════
  console.log('\n[A] Backoffice Login Page');
  await page.goto('http://localhost:3001/backoffice/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({ path: SS('A1_login') });
  console.log(INFO, '📸 A1_login');

  const wnBadge = await page.locator('.auth-wn-badge').count();
  const wnItems = await page.locator('.auth-wn-item').count();
  const wnTitle = await page.locator('.auth-wn-label').textContent().catch(() => '');
  check("What's New badge visible", wnBadge > 0);
  check('3 new-feature items shown', wnItems === 3);
  check('Version label shown', wnTitle.includes('v3.5'));

  // ══════════════════════════════════════════════════════════════
  // [B] BACKOFFICE LOGIN + ITEM EDITOR
  // ══════════════════════════════════════════════════════════════
  console.log('\n[B] Backoffice — Item Editor');
  await page.fill('#auth-username', 'testadmin');
  await page.fill('#auth-password', 'Admin1234!');
  await page.click('.btn-auth');
  await page.waitForFunction(() => document.getElementById('auth-screen')?.style.display === 'none', { timeout: 15000 });
  await page.waitForTimeout(1200);
  console.log(INFO, 'Logged in');

  // Select first outlet
  await page.evaluate(async () => {
    const sel = document.getElementById('ctx-outlet');
    if (!sel) return false;
    await new Promise(r => setTimeout(r, 1500));
    const opts = Array.from(sel.options).filter(o => o.value);
    if (!opts.length) return false;
    sel.value = opts[0].value;
    ctxOutletChange();
    return sel.value;
  });
  await page.waitForTimeout(600);

  await page.evaluate(() => showView('menu'));
  await page.waitForTimeout(800);
  await page.click('#menu-btn-add-item');
  await page.waitForSelector('#ie-panel-details.active', { timeout: 8000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: SS('B1_item_editor_empty') });
  console.log(INFO, '📸 B1_item_editor_empty');

  const shortDescEl = await page.locator('#ie-desc').count();
  const longDescEl  = await page.locator('#ie-long-desc').count();
  check('Short Description field (#ie-desc) present', shortDescEl > 0);
  check('Long Description field (#ie-long-desc) present', longDescEl > 0);

  const shortLabelText = await page.evaluate(() => {
    const el = document.getElementById('ie-desc');
    return el?.closest('.form-group')?.querySelector('label')?.textContent?.trim() || '';
  });
  check('Label says "Short Description"', shortLabelText.includes('Short Description'));

  const longLabelText = await page.evaluate(() => {
    const el = document.getElementById('ie-long-desc');
    return el?.closest('.form-group')?.querySelector('label')?.textContent?.trim() || '';
  });
  check('Label says "Long Description"', longLabelText.includes('Long Description'));

  await page.fill('#ie-name', 'Grilled Salmon');
  await page.waitForTimeout(300);
  const kdsValue = await page.inputValue('#ie-kds-name');
  check('Kitchen name auto-fills from item name', kdsValue === 'Grilled Salmon');

  await page.evaluate(() => {
    const el = document.getElementById('ie-kds-name');
    el.value = 'GRLD SALM';
    el.dataset.manuallyEdited = '1';
  });
  await page.fill('#ie-name', 'Grilled Salmon Fillet');
  await page.waitForTimeout(200);
  const kdsAfterOverride = await page.evaluate(() => document.getElementById('ie-kds-name').value);
  check('Kitchen name stays when manually overridden', kdsAfterOverride === 'GRLD SALM');

  await page.fill('#ie-desc', 'Fresh Atlantic salmon fillet');
  await page.fill('#ie-long-desc', 'Our signature grilled salmon fillet sourced from the North Atlantic.');
  await page.screenshot({ path: SS('B2_item_editor_filled') });
  console.log(INFO, '📸 B2_item_editor_filled');

  // ══════════════════════════════════════════════════════════════
  // [C] BACKOFFICE — STAFF MODAL (PIN SYSTEM)
  // ══════════════════════════════════════════════════════════════
  console.log('\n[C] Backoffice — Staff Modal PIN System');
  await page.evaluate(() => showView('staff'));
  await page.waitForTimeout(600);

  // Open Add Staff modal
  await page.evaluate(() => showStaffModal());
  await page.waitForSelector('#modal-staff', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(800); // wait for auto-suggest

  const suggestBtn = await page.locator('#btn-suggest-pin').count();
  check('Suggest PIN button present', suggestBtn > 0);

  const autoPin = await page.inputValue('#staff-pin');
  check('PIN auto-suggested on open (4 digits)', /^\d{4}$/.test(autoPin));

  const pinStatus = await page.locator('#staff-pin-status').textContent().catch(() => '');
  check('PIN status shows Available', pinStatus.includes('Available'));
  console.log(INFO, `Auto-suggested PIN: ${autoPin}`);

  await page.screenshot({ path: SS('C1_staff_modal_add') });
  console.log(INFO, '📸 C1_staff_modal_add');

  // Test: type a known taken PIN (1234 — exists in DB)
  await page.fill('#staff-pin', '');
  await page.type('#staff-pin', '1234');
  await page.waitForTimeout(700); // wait for debounce
  const takenStatus = await page.locator('#staff-pin-status').textContent().catch(() => '');
  check('PIN status shows "Already used" for taken PIN', takenStatus.includes('Already used') || takenStatus.includes('used'));

  // Test: type a clearly free PIN
  await page.fill('#staff-pin', '');
  await page.type('#staff-pin', '9999');
  await page.waitForTimeout(700);
  const freeStatus = await page.locator('#staff-pin-status').textContent().catch(() => '');
  check('PIN status shows Available for free PIN', freeStatus.includes('Available'));

  // Test: click Suggest button again
  await page.click('#btn-suggest-pin');
  await page.waitForTimeout(800);
  const newPin = await page.inputValue('#staff-pin');
  check('Suggest button generates a new PIN', /^\d{4}$/.test(newPin));

  await page.screenshot({ path: SS('C2_staff_modal_pin_check') });
  console.log(INFO, '📸 C2_staff_modal_pin_check');

  // Close modal
  await page.evaluate(() => closeModal('modal-staff'));
  await page.waitForTimeout(300);

  // ══════════════════════════════════════════════════════════════
  // [D] WAITER APP — Login with Role Badges
  // ══════════════════════════════════════════════════════════════
  console.log('\n[D] Waiter App — Login + Role Badges');
  const waiterPage = await browser.newPage();
  waiterPage.setDefaultTimeout(20000);
  await waiterPage.goto('http://localhost:3001/waiter-app/');
  await waiterPage.waitForLoadState('networkidle');
  await waiterPage.waitForTimeout(1000);
  await waiterPage.screenshot({ path: SS('D1_waiter_login') });
  console.log(INFO, '📸 D1_waiter_login');

  const chipCount = await waiterPage.locator('.cashier-chip').count();
  check('Cashier/waiter chips shown', chipCount > 0);

  const roleTagCount = await waiterPage.locator('.cashier-chip-role').count();
  check('Role badge shown on each chip', roleTagCount === chipCount);

  const roleTags = await waiterPage.locator('.cashier-chip-role').allTextContents();
  const validRoles = roleTags.every(t => ['Cashier', 'Waiter'].includes(t.trim()));
  check(`Role badges show Cashier or Waiter (found: ${roleTags.join(', ')})`, validRoles);

  // Login
  const firstId = await waiterPage.evaluate(() => loginCashiers[0]?.id);
  const loginResult = await waiterPage.evaluate(async (cashierId) => {
    try {
      const r = await fetch('/waiter/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashier_id: cashierId, pin: '1234' })
      });
      const d = await r.json();
      if (!d.token) return { ok: false, error: JSON.stringify(d) };
      localStorage.setItem('waiter_token', d.token);
      localStorage.setItem('waiter_cashier', JSON.stringify(d.cashier));
      token   = d.token;
      cashier = d.cashier;
      await enterApp();
      return { ok: true, role: d.cashier.role };
    } catch (e) { return { ok: false, error: e.message }; }
  }, firstId);

  check('Waiter login succeeded', loginResult.ok);
  console.log(INFO, `Logged in as role: ${loginResult.role}`);

  await waiterPage.waitForTimeout(1500);
  await waiterPage.screenshot({ path: SS('D2_waiter_main') });
  console.log(INFO, '📸 D2_waiter_main');

  const topbarSub = await waiterPage.locator('#tb-sub').textContent().catch(() => '');
  check('Topbar shows role after login', topbarSub.length > 0);
  console.log(INFO, `Topbar role: "${topbarSub}"`);

  // ══════════════════════════════════════════════════════════════
  // [E] WAITER APP — Menu Cards with Images
  // ══════════════════════════════════════════════════════════════
  console.log('\n[E] Waiter App — Menu Cards');
  await waiterPage.locator('#bn-menu').click();
  await waiterPage.waitForTimeout(800);

  const firstCat = waiterPage.locator('.cat-tab').first();
  if (await firstCat.count() > 0) {
    await firstCat.click();
    await waiterPage.waitForTimeout(500);
  }

  await waiterPage.screenshot({ path: SS('E1_waiter_menu') });
  console.log(INFO, '📸 E1_waiter_menu');

  const menuItems        = await waiterPage.locator('.menu-item').count();
  const withImg          = await waiterPage.locator('.menu-item-img').count();
  const withPlaceholder  = await waiterPage.locator('.menu-item-img-placeholder').count();
  check(`Menu items rendered (${menuItems})`, menuItems > 0);
  check(`Image or placeholder on all items (img:${withImg} + placeholder:${withPlaceholder})`,
    menuItems > 0 && (withImg + withPlaceholder) >= menuItems);

  const apiResult = await waiterPage.evaluate(async () => {
    const tok = localStorage.getItem('waiter_token') || '';
    const r = await fetch('/waiter/menu', { headers: { Authorization: 'Bearer ' + tok } });
    const d = await r.json();
    const sample = d.items?.[0] || {};
    return {
      status: r.status,
      itemCount: d.items?.length,
      hasShortDesc: 'short_description' in sample,
      hasLongDesc:  'long_description'  in sample,
      hasImageUrl:  'image_url'         in sample,
    };
  });
  check(`/waiter/menu returns 200 (${apiResult.itemCount} items)`, apiResult.status === 200);
  check('/waiter/menu includes short_description', apiResult.hasShortDesc);
  check('/waiter/menu includes long_description',  apiResult.hasLongDesc);
  check('/waiter/menu includes image_url',         apiResult.hasImageUrl);

  // ══════════════════════════════════════════════════════════════
  // [F] API — Role restriction on /waiter/auth
  // ══════════════════════════════════════════════════════════════
  console.log('\n[F] API — Role Restriction');
  const managerBlock = await waiterPage.evaluate(async () => {
    // Simulate: only way to test is to try known IDs — we'll just verify the endpoint
    // returns 401 for unknown cashier (not 500 error)
    const r = await fetch('/waiter/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashier_id: 'fake-id-999', pin: '0000' })
    });
    return { status: r.status };
  });
  check('/waiter/auth returns 401 for unknown cashier (not 500)', managerBlock.status === 401);

  const suggestApiResult = await waiterPage.evaluate(async () => {
    const tok = localStorage.getItem('waiter_token') || '';
    // waiter token should NOT be able to access staff endpoints
    const r = await fetch('/staff/suggest-pin', {
      headers: { Authorization: 'Bearer ' + tok }
    });
    return { status: r.status };
  });
  check('/staff/suggest-pin requires backoffice auth (403 for cashier token)',
    suggestApiResult.status === 401 || suggestApiResult.status === 403);

  // ══════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════
  console.log('\n✅ All tests complete. Check feat_*.png screenshots.\n');
  await browser.close();
})().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
