'use strict';
const { _electron: electron } = require('C:/Users/Lenovo/node_modules/playwright');
const path = require('path');
const BASE = 'D:/sofwtares/RESTAURANT POS';
const EXEC = path.join(BASE, 'pos/node_modules/electron/dist/electron.exe');
const APP  = path.join(BASE, 'pos');
const SS   = (name) => path.join(BASE, `ss_${name}.png`);

async function shot(win, name) {
  try { await win.screenshot({ path: SS(name) }); } catch(_) {}
  console.log(`  📸 ${name}`);
}

async function addItem(win, idx) {
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
    console.log(`    → Variant picker shown`);
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
    console.log(`    → Modifier prompt shown`);
    await win.evaluate(() => {
      document.querySelectorAll('.mpick-group').forEach(g => {
        const first = g.querySelector('.mpick-opt');
        if (first && !first.classList.contains('selected')) first.click();
      });
      const cb = document.querySelector('#modal-modifier-prompt .btn-primary');
      if (cb) cb.click();
    });
    await win.waitForTimeout(500);
  }
}

(async () => {
  console.log('Launching POS...');
  const app = await electron.launch({ executablePath: EXEC, args: ['.'], cwd: APP });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(3000);
  await shot(win, '01_startup');

  // ── Step 1: Login ────────────────────────────────────────────
  console.log('Step 1: Login...');
  await win.evaluate(() => {
    const chip = document.querySelector('.cashier-chip');
    if (chip) chip.click();
  });
  await win.waitForTimeout(600);
  for (const digit of ['1','2','3','4']) {
    await win.evaluate((d) => { if (typeof pinKey === 'function') pinKey(d); }, digit);
    await win.waitForTimeout(200);
  }
  await win.waitForTimeout(4000);
  await shot(win, '02_after_login');

  // ── Step 2: New Order (Takeaway) ──────────────────────────────
  console.log('Step 2: New Order (Takeaway)...');
  // Call showPosEntry directly — most reliable path for automated tests
  const entryResult = await win.evaluate(() => {
    try {
      showPosEntry('takeaway');
      return { ok: true, mode: cart.mode, type: cart.type };
    } catch(e) { return { ok: false, err: e.message }; }
  });
  console.log(`  Entry: ${JSON.stringify(entryResult)}`);
  await win.waitForTimeout(1500);
  await shot(win, '03_entry_panel');

  // ── Step 3: Add items ─────────────────────────────────────────
  console.log('Step 3: Adding items...');
  const itemCount = await win.evaluate(() => document.querySelectorAll('.nitem-card').length);
  console.log(`  Menu items visible: ${itemCount}`);

  await addItem(win, 0);
  await shot(win, '04_item1_added');
  if (itemCount > 1) {
    await addItem(win, 1);
    await shot(win, '05_item2_added');
  }

  const cartCount = await win.evaluate(() => window.cart ? window.cart.items.length : 0);
  console.log(`  Cart items: ${cartCount}`);
  await shot(win, '06_cart_filled');

  // ── Step 4: Send KOT ──────────────────────────────────────────
  console.log('Step 4: Send KOT...');
  const kotResult = await win.evaluate(async () => {
    try {
      await placeOrder();
      return { ok: true, mode: cart.mode, orderId: cart.orderId };
    } catch(e) { return { ok: false, err: e.message }; }
  });
  console.log(`  KOT result: ${JSON.stringify(kotResult)}`);
  await win.waitForTimeout(1500);
  await shot(win, '07_after_kot');

  // ── Step 5: Payment ──────────────────────────────────────────
  console.log('Step 5: Payment...');
  const payState = await win.evaluate(() => {
    const btn = document.getElementById('btn-pay-cash');
    return { exists: !!btn, disabled: btn ? btn.disabled : true };
  });
  console.log(`  Pay button: exists=${payState.exists}, disabled=${payState.disabled}`);

  if (!payState.disabled) {
    const payResult = await win.evaluate(async () => {
      try {
        await handlePayClick('cash');
        await new Promise(r => setTimeout(r, 1000));
        await confirmPayment();
        return { ok: true };
      } catch(e) { return { ok: false, err: e.message }; }
    });
    console.log(`  Payment result: ${JSON.stringify(payResult)}`);
    await win.waitForTimeout(2000);
    await shot(win, '08_payment_done');
  } else {
    console.log('  Pay button disabled — KOT may have failed');
    await shot(win, '08_pay_disabled');
  }

  await win.waitForTimeout(1000);
  await shot(win, '09_final');
  console.log('\n✅ Test sale complete.');
  await app.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
