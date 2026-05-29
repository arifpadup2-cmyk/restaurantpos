import { _electron } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔍 DAY OPEN GUARD TEST\n');

let app;
try {
  app = await _electron.launch({
    executablePath: path.join(__dirname, 'node_modules/electron/dist/electron.exe'),
    args: [__dirname],
  });

  const window = await app.firstWindow();
  await window.setViewportSize({ width: 450, height: 800 });
  await window.waitForTimeout(2500);

  // LOGIN
  console.log('Step 1: Login');
  for (const digit of '1111') {
    await window.keyboard.press(digit);
    await window.waitForTimeout(100);
  }
  await window.keyboard.press('Enter');
  await window.waitForTimeout(2500);
  console.log('✓ Logged in\n');

  // CHECK INITIAL STATE
  const initialState = await window.evaluate(() => {
    return {
      dayStatusText: document.getElementById('hdr-day-status')?.textContent,
      dayStatusClass: document.getElementById('hdr-day-status')?.className,
      dayOpenModalVisible: document.getElementById('day-open-overlay')?.style.display === 'flex',
      _activeDay: typeof _activeDay !== 'undefined' ? _activeDay : null
    };
  });

  console.log('Initial State:');
  console.log(`  Day Status Text: ${initialState.dayStatusText}`);
  console.log(`  Day Status Class: ${initialState.dayStatusClass}`);
  console.log(`  Day Open Modal Visible: ${initialState.dayOpenModalVisible}`);
  console.log(`  _activeDay value: ${JSON.stringify(initialState._activeDay)}\n`);

  // IF MODAL NOT VISIBLE, OPEN A DAY
  if (!initialState.dayOpenModalVisible && !initialState._activeDay) {
    console.log('Opening day manually via console...');
    const opened = await window.evaluate(() => {
      if (!_activeDay) {
        _activeDay = { date: '2026-05-29', id: 'test', opened_by: 'test' };
        updateDayStatusUI();
        return true;
      }
      return false;
    });
    console.log(`✓ Day opened: ${opened}\n`);
  }

  // CHECK STATE AFTER DAY OPEN
  const afterOpen = await window.evaluate(() => {
    return {
      dayStatusText: document.getElementById('hdr-day-status')?.textContent,
      dayStatusClass: document.getElementById('hdr-day-status')?.className,
      _activeDay: typeof _activeDay !== 'undefined' ? _activeDay : null
    };
  });

  console.log('After Day Open:');
  console.log(`  Day Status Text: ${afterOpen.dayStatusText}`);
  console.log(`  Day Status Class: ${afterOpen.dayStatusClass}`);
  console.log(`  _activeDay exists: ${afterOpen._activeDay !== null}\n`);

  // TRY TO CREATE ORDER
  console.log('Step 2: Create Order');
  const orderType = await window.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (let btn of btns) {
      if (btn.textContent?.toLowerCase().includes('dine')) {
        btn.click();
        return 'dine-in';
      }
    }
    return null;
  });

  if (orderType) {
    await window.waitForTimeout(1500);
    console.log(`✓ Order type created: ${orderType}\n`);

    // SELECT TABLE & ITEM
    await window.evaluate(() => {
      const chips = document.querySelectorAll('.table-chip');
      if (chips.length > 0) chips[0].click();
    });
    await window.waitForTimeout(1000);

    await window.evaluate(() => {
      const cards = document.querySelectorAll('.item-card');
      if (cards.length > 0) cards[0].click();
    });
    await window.waitForTimeout(1200);

    // HANDLE MODALS
    const hasVariant = await window.evaluate(() => {
      const modal = document.getElementById('modal-variant-picker');
      if (modal && modal.style.display !== 'none') {
        const item = document.querySelector('.vpick-item');
        if (item) item.click();
        return true;
      }
      return false;
    });
    if (hasVariant) await window.waitForTimeout(800);

    const hasModifier = await window.evaluate(() => {
      const modal = document.getElementById('modal-modifier-prompt');
      if (modal && modal.style.display !== 'none') {
        const btn = document.querySelector('#modal-modifier-prompt .btn-primary');
        if (btn && !btn.disabled) btn.click();
        return true;
      }
      return false;
    });
    if (hasModifier) await window.waitForTimeout(1500);

    // NOW TRY PLACE ORDER & CAPTURE TOAST
    console.log('Step 3: Try Place Order (with guard check)\n');

    const result = await window.evaluate(() => {
      const toastArea = document.createElement('div');
      toastArea.id = 'toast-test-capture';
      toastArea.style.display = 'none';
      document.body.appendChild(toastArea);

      // Capture any toast messages
      const originalShowToast = window.showToast;
      let lastToast = null;
      window.showToast = function(msg, type) {
        lastToast = { msg, type };
        return originalShowToast.call(this, msg, type);
      };

      // Find and click place order button
      const buttons = document.querySelectorAll('button');
      let clicked = false;
      for (let btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('checkout') || text.includes('place order') || text.includes('pay')) {
          if (!btn.disabled) {
            btn.click();
            clicked = true;
            break;
          }
        }
      }

      return {
        orderClicked: clicked,
        lastToastMsg: lastToast?.msg,
        lastToastType: lastToast?.type,
        dayOpenValue: typeof _activeDay !== 'undefined' ? _activeDay : null
      };
    });

    console.log('Place Order Result:');
    console.log(`  Order button clicked: ${result.orderClicked}`);
    console.log(`  Last toast message: ${result.lastToastMsg}`);
    console.log(`  Last toast type: ${result.lastToastType}`);
    console.log(`  _activeDay at order time: ${JSON.stringify(result.dayOpenValue)}\n`);

    if (result.lastToastMsg?.includes('Business day')) {
      console.log('✅ GUARD WORKING: Order blocked due to closed day');
    } else if (result.orderClicked) {
      console.log('⚠️ GUARD NOT WORKING: Order was allowed even though day status shows closed');
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('Test complete');

  await app.close();
  process.exit(0);

} catch (err) {
  console.error('Error:', err.message);
  if (app) await app.close();
  process.exit(1);
}
