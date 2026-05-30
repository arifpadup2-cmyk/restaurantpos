// Drives the POS login end-to-end (Electron via Playwright).
import { _electron as electron } from 'playwright';

const log = (...a) => console.log(...a);
const app = await electron.launch({ args: ['.'] });
const win = await app.firstWindow();
log('● window opened — waiting for boot + auto-sync…');
await win.waitForTimeout(11000);

const screens = await win.evaluate(() => ({
  setup: getComputedStyle(document.getElementById('screen-setup')).display,
  login: getComputedStyle(document.getElementById('screen-login')).display,
  pinBoxShown: document.getElementById('pin-box')?.classList.contains('show'),
}));
log('● screens:', JSON.stringify(screens));

// Enter PIN 5436 via the real pin pad path (auto-submits at 4 digits)
log('● entering PIN 5436…');
await win.evaluate(() => { ['5','4','3','6'].forEach(d => pinKey(d)); });
await win.waitForTimeout(2000);

const afterPin = await win.evaluate(() => ({
  cashBoxShown: document.getElementById('cash-box')?.classList.contains('show'),
  dayHintDisplay: getComputedStyle(document.getElementById('cash-day-hint')).display,
  startBtnText: document.getElementById('cash-start-btn')?.textContent?.trim(),
  cashierName: document.getElementById('cash-cashier-name')?.textContent?.trim(),
  pinError: (document.querySelector('.pin-error')?.textContent || '').trim(),
}));
log('● after PIN:', JSON.stringify(afterPin, null, 0));

// Enter opening cash and start (should Open Day + Start Shift together)
log('● entering opening cash 500 and starting…');
await win.evaluate(() => { document.getElementById('login-cash').value = '500'; startShift(); });
await win.waitForTimeout(2500);

const afterShift = await win.evaluate(() => ({
  loginScreenDisplay: getComputedStyle(document.getElementById('screen-login')).display,
  // header day status text if present
  dayStatus: document.getElementById('day-status-text')?.textContent?.trim()
           || document.getElementById('hdr-day')?.textContent?.trim() || null,
  restName: document.getElementById('hdr-rest-name')?.textContent?.trim() || null,
}));
log('● after shift/login:', JSON.stringify(afterShift, null, 0));

log(afterShift.loginScreenDisplay === 'none' ? '✅ LOGGED IN (login screen hidden → in POS)' : '⚠ still on login screen');
await app.close();
log('● DONE');
