'use strict';
const { _electron: electron } = require('C:/Users/Lenovo/node_modules/playwright');
const path = require('path');
const fs   = require('fs');

const BASE = 'D:/sofwtares/RESTAURANT POS';
const EXEC = path.join(BASE, 'pos/node_modules/electron/dist/electron.exe');
const APP  = path.join(BASE, 'pos');
const SS   = (name) => path.join(BASE, `ss_${name}.png`);

async function shot(win, name) {
  try { await win.screenshot({ path: SS(name) }); } catch(_) {}
  console.log(`  📸 ${name}`);
}

async function jsClick(win, expr) {
  try { await win.evaluate(expr); } catch(e) { console.log('  jsClick err:', e.message); }
}

(async () => {
  console.log('Launching POS...');
  const app = await electron.launch({
    executablePath: EXEC,
    args: ['.'],
    cwd: APP,
  });

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(3000);
  await shot(win, '01_startup');

  // ── Step 1: Login ────────────────────────────────────────────
  console.log('Step 1: Login with PIN 1111...');
  // First: select a cashier if the chip grid is visible
  await win.evaluate(() => {
    const chip = document.querySelector('.cashier-chip');
    if (chip) chip.click();
  });
  await win.waitForTimeout(600);
  await shot(win, '01b_cashier_selected');

  // Enter PIN via pinKey() — auto-submits after 4 digits
  for (const digit of ['1','2','3','4']) {
    await win.evaluate((d) => { if (typeof pinKey === 'function') pinKey(d); }, digit);
    await win.waitForTimeout(200);
  }
  await shot(win, '02_pin_entered');
  await win.waitForTimeout(4000);  // wait for DB + shift init
  await shot(win, '03_after_login');

  // ── Step 2: New Order ─────────────────────────────────────────
  console.log('Step 2: New Order...');
  await win.waitForTimeout(1000);
  await jsClick(win, '() => showNewOrderDialog()');
  await win.waitForTimeout(1500);
  await shot(win, '04_new_order_dialog');

  // Pick Takeaway to avoid the table picker, or Dine In + select a table
  const picked = await win.evaluate(() => {
    const btns = [...document.querySelectorAll('.notp-btn:not([disabled])')];
    // Prefer takeaway to skip table picker
    const takeaway = btns.find(b => /takeaway|take.?away|to.?go/i.test(b.textContent));
    const target = takeaway || btns[0];
    if (target) { target.click(); return target.querySelector('.notp-label')?.textContent || '?'; }
    if (typeof showPosEntry === 'function') { showPosEntry('takeaway'); return 'takeaway (fallback)'; }
    return 'none';
  });
  console.log(`  Order type: ${picked}`);
  await win.waitForTimeout(1500);

  // If table picker appeared (dine-in fallback), click first table
  const tablePickerVisible = await win.evaluate(() => {
    const tp = document.querySelector('.table-select-popup, [id*="table-select"], .modal-overlay');
    return tp && tp.offsetParent !== null;
  });
  if (tablePickerVisible) {
    console.log('  Table picker visible — selecting first table');
    await win.evaluate(() => {
      const tbl = document.querySelector('.tsp-table-btn:not([disabled]), .table-btn');
      if (tbl) tbl.click();
    });
    await win.waitForTimeout(1000);
  }
  await win.waitForTimeout(1500);
  await shot(win, '05_entry_panel');

  // ── Step 3: Add items ─────────────────────────────────────────
  console.log('Step 3: Adding items...');
  const itemCount = await win.evaluate(() => document.querySelectorAll('.nitem-card').length);
  console.log(`  Menu items visible: ${itemCount}`);

  async function addItem(idx) {
    const added = await win.evaluate((i) => {
      const cards = document.querySelectorAll('.nitem-card');
      if (!cards[i]) return false;
      cards[i].click();
      return true;
    }, idx);
    if (!added) return;
    await win.waitForTimeout(800);

    // Variant picker
    const hasVariant = await win.evaluate(() => {
      const el = document.getElementById('modal-variant-picker');
      return el && el.style.display !== 'none';
    });
    if (hasVariant) {
      console.log(`  → Variant picker shown`);
      await shot(win, `06_variant_item${idx}`);
      await win.evaluate(() => {
        const opt = document.querySelector('.vpick-item');
        if (opt) opt.click();
      });
      await win.waitForTimeout(500);
    }

    // Modifier prompt
    const hasMod = await win.evaluate(() => {
      const el = document.getElementById('modal-modifier-prompt');
      return el && el.style.display !== 'none';
    });
    if (hasMod) {
      console.log(`  → Modifier prompt shown`);
      await shot(win, `07_modifier_item${idx}`);
      await win.evaluate(() => {
        // Select first option in each required group
        document.querySelectorAll('.mpick-group').forEach(g => {
          const first = g.querySelector('.mpick-opt');
          if (first && !first.classList.contains('selected')) first.click();
        });
        // Confirm
        const cb = document.querySelector('#modal-modifier-prompt .btn-primary');
        if (cb) cb.click();
      });
      await win.waitForTimeout(500);
    }
  }

  await addItem(0);
  await shot(win, '08_item1_added');
  if (itemCount > 1) {
    await addItem(1);
    await shot(win, '09_item2_added');
  }

  const cartCount = await win.evaluate(() => window.cart?.items?.length || 0);
  console.log(`  Cart items: ${cartCount}`);
  await shot(win, '09_cart_filled');

  // ── Step 4: Send KOT ──────────────────────────────────────────
  console.log('Step 4: Send KOT...');
  const kotState = await win.evaluate(() => {
    const btn = document.getElementById('btn-place-order');
    return { exists: !!btn, disabled: btn ? btn.disabled : true };
  });
  console.log(`  KOT button: exists=${kotState.exists}, disabled=${kotState.disabled}`);

  // Await placeOrder() fully — evaluate with async wrapper so Playwright waits for the Promise
  const kotResult = await win.evaluate(async () => {
    try { await placeOrder(); return { ok: true, mode: cart.mode, orderId: cart.orderId }; }
    catch(e) { return { ok: false, err: e.message }; }
  });
  console.log(`  KOT result: ${JSON.stringify(kotResult)}`);
  await win.waitForTimeout(1500);
  await shot(win, '10_after_kot');

  // ── Step 5: Payment ──────────────────────────────────────────
  console.log('Step 5: Payment...');
  const mode = await win.evaluate(() => window.cart?.mode);
  console.log(`  Cart mode: ${mode}`);
  await shot(win, '11_billing_mode');

  const payState = await win.evaluate(() => {
    const btn = document.getElementById('btn-pay-cash');
    return { exists: !!btn, disabled: btn ? btn.disabled : true };
  });
  console.log(`  Pay button: exists=${payState.exists}, disabled=${payState.disabled}`);

  if (!payState.disabled) {
    // Open cash payment modal
    await win.evaluate(async () => { await handlePayClick('cash'); });
    await win.waitForTimeout(1500);
    await shot(win, '12_payment_modal');

    // Confirm payment
    const payResult = await win.evaluate(async () => {
      try { await confirmPayment(); return { ok: true }; }
      catch(e) { return { ok: false, err: e.message }; }
    });
    await win.waitForTimeout(2000);
    await shot(win, '13_payment_done');
    console.log(`  Payment result: ${JSON.stringify(payResult)}`);
  } else {
    console.log('  Pay button disabled — KOT may have failed');
    await shot(win, '12_pay_disabled');
  }

  await win.waitForTimeout(1000);
  await shot(win, '14_final');
  console.log('\n✅ Test sale complete.');
  await app.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
