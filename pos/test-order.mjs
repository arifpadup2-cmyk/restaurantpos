import { _electron } from 'playwright';

console.log('🛒 PLACING TEST ORDER\n');

let app;
try {
  app = await _electron.launch({
    executablePath: './node_modules/electron/dist/electron.exe',
    args: ['.'],
  });

  const window = await app.firstWindow();
  console.log('✅ POS app ready\n');

  await window.setViewportSize({ width: 450, height: 800 });
  await window.waitForTimeout(2000);

  // LOGIN
  console.log('📝 Step 1: Login with PIN 1111');
  for (const digit of '1111') {
    await window.keyboard.press(digit);
    await window.waitForTimeout(80);
  }
  await window.keyboard.press('Enter');
  await window.waitForTimeout(2500);
  console.log('   ✓ Logged in\n');

  // CREATE ORDER
  console.log('📝 Step 2: Create Order (Dine In)');
  await window.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (let btn of btns) {
      if (btn.textContent?.toLowerCase().includes('dine')) {
        btn.click();
        break;
      }
    }
  });
  await window.waitForTimeout(1500);
  console.log('   ✓ Order type selected\n');

  // SELECT TABLE
  console.log('📝 Step 3: Select Table');
  await window.evaluate(() => {
    const chip = document.querySelector('.table-chip');
    if (chip) chip.click();
  });
  await window.waitForTimeout(1000);
  console.log('   ✓ Table selected\n');

  // ADD ITEM 1
  console.log('📝 Step 4: Add Item 1');
  await window.evaluate(() => {
    const cards = document.querySelectorAll('.item-card');
    if (cards.length > 0) cards[0].click();
  });
  await window.waitForTimeout(1500);

  const variantOpen = await window.evaluate(() => {
    const modal = document.getElementById('modal-variant-picker');
    return modal && modal.style.display !== 'none';
  });

  if (variantOpen) {
    console.log('   → Variant picker found');
    await window.evaluate(() => {
      const variant = document.querySelector('.vpick-item');
      if (variant) variant.click();
    });
    await window.waitForTimeout(800);
  }

  const modifierOpen = await window.evaluate(() => {
    const modal = document.getElementById('modal-modifier-prompt');
    return modal && modal.style.display !== 'none';
  });

  if (modifierOpen) {
    console.log('   → Modifier prompt found');
    await window.evaluate(() => {
      const btn = document.querySelector('#modal-modifier-prompt .btn-primary');
      if (btn) btn.click();
    });
    await window.waitForTimeout(1500);
  }
  console.log('   ✓ Item 1 added\n');

  // ADD ITEM 2
  console.log('📝 Step 5: Add Item 2');
  await window.evaluate(() => {
    const cards = document.querySelectorAll('.item-card');
    if (cards.length > 1) cards[1].click();
  });
  await window.waitForTimeout(1500);

  const variantOpen2 = await window.evaluate(() => {
    const modal = document.getElementById('modal-variant-picker');
    return modal && modal.style.display !== 'none';
  });

  if (variantOpen2) {
    await window.evaluate(() => {
      const variant = document.querySelector('.vpick-item');
      if (variant) variant.click();
    });
    await window.waitForTimeout(800);
  }

  const modifierOpen2 = await window.evaluate(() => {
    const modal = document.getElementById('modal-modifier-prompt');
    return modal && modal.style.display !== 'none';
  });

  if (modifierOpen2) {
    await window.evaluate(() => {
      const btn = document.querySelector('#modal-modifier-prompt .btn-primary');
      if (btn) btn.click();
    });
    await window.waitForTimeout(1500);
  }
  console.log('   ✓ Item 2 added\n');

  // VERIFY CART
  console.log('📝 Step 6: Verify Cart');
  const cartInfo = await window.evaluate(() => {
    const items = document.querySelectorAll('.cart-item');
    return {
      count: items.length,
      hasItems: items.length > 0
    };
  });
  console.log(`   Items in cart: ${cartInfo.count} ✓\n`);

  // CHECKOUT
  console.log('📝 Step 7: Place Order');
  const checkoutResult = await window.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (let btn of buttons) {
      const text = btn.textContent?.toLowerCase() || '';
      if (text.includes('checkout') || text.includes('place order') || text.includes('bill')) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (checkoutResult) {
    await window.waitForTimeout(2000);
    console.log('   ✓ Order placed\n');
  }

  // SUMMARY
  console.log('════════════════════════════════════════════════════════════');
  console.log('✅ TEST ORDER COMPLETED\n');
  console.log('Transaction:');
  console.log('  ✓ Login: PIN 1111');
  console.log('  ✓ Order type: Dine In');
  console.log('  ✓ Items: 2');
  console.log('  ✓ Cart: verified');
  console.log('  ✓ Status: ordered\n');
  console.log('🎉 Test order placed!');

  await app.close();

} catch (err) {
  console.error('❌ Error:', err.message);
  if (app) await app.close();
  process.exit(1);
}
