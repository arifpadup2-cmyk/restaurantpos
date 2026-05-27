'use strict';
const { chromium, _electron } = require('C:/Users/Lenovo/node_modules/playwright');

(async () => {
  // ── 1. WAITER APP: place a takeaway order ──────────────────────────────────
  console.log('\n[1] Waiter App — placing takeaway order as Test Waiter');
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const wp = await browser.newPage();
  wp.setDefaultTimeout(25000);
  await wp.goto('http://localhost:3001/waiter-app/');
  await wp.waitForLoadState('networkidle');
  await wp.waitForTimeout(1000);

  // Login as Test Waiter
  await wp.locator('.cashier-chip', { hasText: 'Test Waiter' }).click();
  await wp.waitForSelector('#pin-box', { state: 'visible' });
  for (const d of ['9','3','3','3']) {
    await wp.locator('.pp-btn', { hasText: d }).first().click();
    await wp.waitForTimeout(150);
  }
  await wp.waitForFunction(
    () => document.getElementById('s-main')?.classList.contains('active'),
    { timeout: 10000 }
  );
  await wp.waitForTimeout(1200);
  console.log('   > Logged in');

  // Switch order type to Takeaway (on Tables tab, which is default)
  await wp.locator('.type-btn', { hasText: 'Takeaway' }).click();
  await wp.waitForTimeout(400);
  console.log('   > Order type: Takeaway');

  // Go to Menu tab and add items
  await wp.locator('#bn-menu').click();
  await wp.waitForSelector('#tab-menu.active', { timeout: 8000 });
  await wp.waitForTimeout(500);
  await wp.waitForSelector('.cat-tab', { timeout: 8000 });
  await wp.locator('.cat-tab').first().click();
  await wp.waitForTimeout(600);
  await wp.waitForSelector('.menu-item', { timeout: 8000 });

  const dismissNotes = async () => {
    const show = await wp.locator('#modal-notes').evaluate(el => el.classList.contains('show')).catch(() => false);
    if (show) {
      await wp.evaluate(() => document.querySelector('#modal-notes .btn-primary')?.click());
      await wp.waitForTimeout(400);
    }
  };

  await wp.locator('.menu-item').first().click();
  await wp.waitForTimeout(600);
  await dismissNotes();

  await wp.locator('.menu-item').nth(1).click();
  await wp.waitForTimeout(600);
  await dismissNotes();

  const items = await wp.evaluate(() => cart.items.map(i => i.item_name + ' x' + i.quantity));
  console.log('   > Cart items:', items);

  // Go to Cart and send order
  await wp.locator('#bn-cart').click();
  await wp.waitForSelector('#tab-cart.active', { timeout: 5000 });
  await wp.waitForTimeout(600);
  await wp.screenshot({ path: 'e2e_01_waiter_cart.png' });
  console.log('   > 📸 e2e_01_waiter_cart');

  await wp.locator('#tab-cart button', { hasText: 'Send to Kitchen' }).click();
  await wp.waitForTimeout(2500);
  await wp.screenshot({ path: 'e2e_02_order_sent.png' });
  console.log('   > 📸 e2e_02_order_sent');

  // Verify order on server
  const orderCheck = await wp.evaluate(async () => {
    const tok = localStorage.getItem('waiter_token');
    const r = await fetch('/waiter/orders', { headers: { Authorization: 'Bearer ' + tok } });
    const d = await r.json();
    return { count: d.orders?.length || 0, latest: d.orders?.[0] };
  });
  console.log('   > Server orders:', orderCheck.count);
  if (orderCheck.latest) {
    console.log('   > Latest order:', orderCheck.latest.order_number, '| type:', orderCheck.latest.order_type, '| total:', orderCheck.latest.total);
  }

  const orderPlaced = orderCheck.count > 0;
  console.log('   >', orderPlaced ? '✅ Order placed successfully' : '❌ Order NOT placed — check error');

  // ── 2. POS TERMINAL ──────────────────────────────────────────────────────────
  console.log('\n[2] POS Terminal — Ali Cashier closes the order');
  const app = await _electron.launch({
    executablePath: 'D:/sofwtares/RESTAURANT POS/pos/node_modules/.bin/electron.cmd',
    args: ['D:/sofwtares/RESTAURANT POS/pos/main.js'],
  });
  const pp = await app.firstWindow();
  pp.setDefaultTimeout(30000);
  await pp.waitForLoadState('domcontentloaded');
  await pp.waitForTimeout(4000);
  await pp.screenshot({ path: 'e2e_03_pos_start.png' });
  console.log('   > 📸 e2e_03_pos_start');

  // Setup screen is hidden when already configured — check if it's actually visible
  const setupScreenVisible = await pp.locator('#screen-setup').evaluate(el =>
    el.style.display !== 'none' && getComputedStyle(el).display !== 'none'
  ).catch(() => false);
  const isSetup = setupScreenVisible;
  const hasChips = await pp.locator('#screen-login .cashier-chip').count() > 0;
  const pinBoxVisible = await pp.locator('.pin-box.show, #pin-box').evaluate(el =>
    el.style.display !== 'none' && getComputedStyle(el).display !== 'none'
  ).catch(() => false);
  console.log('   > Setup visible:', isSetup, '| Chips:', hasChips, '| PIN pad:', pinBoxVisible);

  if (isSetup) {
    console.log('   > Setup mode — waiting for auto-detect or manual fallback...');

    // Wait for either outlet step (auto-detect succeeded) or manual IP form (failed)
    await pp.waitForFunction(() => {
      const outletActive = document.getElementById('setup-step-outlet')?.classList.contains('active');
      const manualVisible = document.getElementById('detect-manual')?.style.display !== 'none';
      return outletActive || manualVisible;
    }, { timeout: 12000 });

    const outletStepActive = await pp.locator('#setup-step-outlet.active').count() > 0;
    console.log('   > Auto-detect succeeded, outlet step:', outletStepActive);

    if (!outletStepActive) {
      // Manual fallback
      console.log('   > Using manual IP...');
      await pp.locator('#setup-ip').fill('127.0.0.1');
      await pp.locator('button', { hasText: /connect/i }).click();
      await pp.waitForSelector('#setup-step-outlet.active', { timeout: 10000 });
    }

    // Outlet selection step
    await pp.screenshot({ path: 'e2e_03b_pos_outlet.png' });
    console.log('   > 📸 e2e_03b_pos_outlet');

    const firstOutlet = pp.locator('.outlet-pick-item, .outlet-pick-card').first();
    if (await firstOutlet.count() > 0) {
      await firstOutlet.click();
      await pp.waitForTimeout(400);
      console.log('   > Outlet selected');
    }

    // Set terminal name
    const midVal = await pp.locator('#setup-mid').inputValue();
    if (!midVal) await pp.locator('#setup-mid').fill('POS-01');

    await pp.screenshot({ path: 'e2e_03c_pos_confirm.png' });
    console.log('   > 📸 e2e_03c_pos_confirm');

    await pp.locator('#btn-setup-confirm').click();
    await pp.waitForTimeout(6000);

    await pp.screenshot({ path: 'e2e_04_pos_after_setup.png' });
    console.log('   > 📸 e2e_04_pos_after_setup');
  }

  // PIN login — check for chip-select mode or direct PIN mode
  const chipsAfterSetup = await pp.locator('#screen-login .cashier-chip').count();
  const directPin = await pp.locator('.pin-box, #pin-box').first().evaluate(el =>
    getComputedStyle(el).display !== 'none'
  ).catch(() => false);

  console.log('   > Login mode — chips:', chipsAfterSetup, '| direct PIN:', directPin);

  if (chipsAfterSetup > 0) {
    console.log('   > Selecting Ali Cashier chip...');
    await pp.locator('.cashier-chip', { hasText: 'Ali Cashier' }).click();
    await pp.waitForTimeout(500);
  }

  // Enter PIN 1234
  console.log('   > Entering PIN 1234...');
  for (const d of ['1','2','3','4']) {
    await pp.locator('.pp-btn', { hasText: d }).first().click();
    await pp.waitForTimeout(200);
  }
  await pp.waitForTimeout(3000);
  await pp.screenshot({ path: 'e2e_05_pos_loggedin.png' });
  console.log('   > 📸 e2e_05_pos_loggedin');

  // Navigate to Orders
  await pp.evaluate(() => { if (typeof showView === 'function') showView('orders'); });
  await pp.waitForTimeout(1500);
  await pp.screenshot({ path: 'e2e_06_pos_orders.png' });
  console.log('   > 📸 e2e_06_pos_orders');

  // Orders are shown in management view as .order-card
  const orderCards = await pp.locator('.order-card').count();
  console.log('   > Order cards in view:', orderCards);

  // Find the Test Waiter order specifically
  const waiterOrderCard = pp.locator('.order-card', { hasText: /W161437|Test Waiter/ }).first();
  const waiterCardCount = await waiterOrderCard.count();
  // Fallback: latest order card (last one)
  const targetCard = waiterCardCount > 0 ? waiterOrderCard : pp.locator('.order-card').last();

  if (orderCards > 0) {
    const cardText = await targetCard.textContent().catch(() => '');
    console.log('   > Target order:', cardText.replace(/\s+/g,' ').trim().slice(0, 80));

    await targetCard.click();
    await pp.waitForTimeout(1500);
    await pp.screenshot({ path: 'e2e_07_order_opened.png' });
    console.log('   > 📸 e2e_07_order_opened');

    // Extract orderId from the "Bill Order" button's onclick (both modals share z-index 500,
    // modal-order comes later in DOM so it sits on top of modal-payment — use JS calls directly)
    const billOrderId = await pp.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('#od-actions button'))
        .find(b => /bill order/i.test(b.textContent));
      if (!btn) return null;
      const m = btn.getAttribute('onclick')?.match(/openPayment\('([^']+)'\)/);
      return m ? m[1] : null;
    });
    console.log('   > Bill Order orderId:', billOrderId);

    if (billOrderId) {
      // Close the order detail modal first, then open payment modal cleanly
      await pp.evaluate(id => {
        closeModal('modal-order');
        openPayment(id);
      }, billOrderId);
      await pp.waitForTimeout(1000);
      await pp.screenshot({ path: 'e2e_07b_payment_screen.png' });
      console.log('   > 📸 e2e_07b_payment_screen');

      // Payment modal should now be visible — confirm with cash
      const payModalVisible = await pp.evaluate(() =>
        document.getElementById('modal-payment')?.classList.contains('show')
      );
      console.log('   > Payment modal open:', payModalVisible);

      // Enter exact cash amount and confirm (0 < total fails validation)
      await pp.evaluate(() => {
        document.getElementById('pay-received').value = String(paymentTotal);
        confirmPayment();
      });
      await pp.waitForTimeout(3000);
      await pp.screenshot({ path: 'e2e_08_paid.png' });
      console.log('   > 📸 e2e_08_paid');

      const remainingCards = await pp.locator('.order-card').count();
      console.log('   > Orders remaining:', remainingCards, '(was', orderCards + ')');
      console.log('   >', remainingCards < orderCards ? '✅ ORDER CLOSED by cashier!' : '⚠ Order count unchanged — check screenshot');
    } else {
      console.log('   > Could not find Bill Order orderId');
      await pp.screenshot({ path: 'e2e_07c_no_billorder.png' });
    }
  } else {
    console.log('   > No order cards found in view');
    const state = await pp.evaluate(() => ({
      activeView: document.querySelector('.view.active')?.id,
      outletId: window._posConfig?.outletId,
    }));
    console.log('   >', JSON.stringify(state));
  }

  await app.close();
  await browser.close();
  console.log('\n✅ E2E test complete.\n');
})().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
