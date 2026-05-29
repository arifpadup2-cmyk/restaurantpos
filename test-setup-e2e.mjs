import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = path.join(__dirname, 'test_downloads');
const BASE_URL = 'http://localhost:3001';

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

console.log('\n═══════════════════════════════════════════════════');
console.log('  🚀 E2E TEST: Setup Package Download Feature');
console.log('═══════════════════════════════════════════════════\n');

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      acceptDownloads: true,
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });

    console.log('📍 Navigating to Backoffice...');
    await page.goto(BASE_URL + '/backoffice/');
    await page.waitForLoadState('networkidle');
    console.log('   ✅ Loaded\n');

    console.log('📍 Checking authentication...');
    const loginForm = await page.$('[placeholder*="Username"]');

    if (loginForm) {
      console.log('   ℹ️  Logging in...');
      await page.fill('[placeholder*="Username"]', 'chillzoneice218');
      await page.fill('[placeholder*="Password"]', 'PWDPU782!');
      const loginBtn = await page.$('button:has-text("Login")');
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForTimeout(3000);
        console.log('   ✅ Logged in\n');
      }
    } else {
      console.log('   ✅ Already logged in\n');
    }

    console.log('📍 Navigate to Outlets...');
    const navConfig = await page.$('[id="nav-config"]');
    if (navConfig) await navConfig.click();
    await page.waitForTimeout(1000);
    console.log('   ✅ Configuration section open\n');

    console.log('📍 Creating outlet...');
    const addBtn = await page.$('button:has-text("Add Outlet")');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1000);
      console.log('   ✅ Modal opened\n');

      console.log('📍 Filling form...');
      const nameInput = await page.$('input[id="outlet-name"]');
      if (nameInput) {
        await nameInput.fill('E2E Test Outlet ' + Date.now());
      }

      const marketSelect = await page.$('select[id="outlet-market-id"]');
      if (marketSelect) {
        const options = await marketSelect.$$('option');
        if (options.length > 1) {
          await marketSelect.selectOption({ index: 1 });
        }
      }
      console.log('   ✅ Form filled\n');

      console.log('📍 Submitting...');
      const saveBtn = await page.$('button:has-text("Save Outlet")');
      if (saveBtn) {
        await saveBtn.click();
        await page.waitForTimeout(2000);

        console.log('📍 Checking success modal...');
        const successModal = await page.$('[id="modal-outlet-setup"]');
        if (successModal) {
          const isVisible = await successModal.evaluate(el =>
            el.style.display !== 'none' && window.getComputedStyle(el).display !== 'none'
          );

          if (isVisible) {
            console.log('   ✅ SUCCESS MODAL APPEARED!\n');

            const codeEl = await page.$('#outlet-setup-code');
            const code = await codeEl.textContent();
            const nameEl = await page.$('#outlet-setup-name');
            const name = await nameEl.textContent();

            console.log('   Outlet Code:', code.trim());
            console.log('   Outlet Name:', name.trim(), '\n');

            console.log('📍 Downloading setup package...');
            const downloadBtn = await successModal.$('button:has-text("Download Setup Package")');

            if (downloadBtn) {
              const downloadPromise = page.waitForEvent('download');
              await downloadBtn.click();
              const download = await downloadPromise;
              const filename = download.suggestedFilename();
              const filepath = path.join(DOWNLOADS_DIR, filename);
              await download.saveAs(filepath);

              const stats = fs.statSync(filepath);
              console.log('   ✅ Downloaded:', filename);
              console.log('   📊 Size:', (stats.size / 1024).toFixed(2), 'KB\n');

              console.log('═══════════════════════════════════════════════════');
              console.log('  ✨ E2E TEST PASSED!');
              console.log('═══════════════════════════════════════════════════\n');
              console.log('Feature verified:');
              console.log('  ✅ Outlet creation works');
              console.log('  ✅ Success modal appears');
              console.log('  ✅ Setup package downloads\n');
              console.log('Download location:', filepath);
            }
          }
        }
      }
    }

    await browser.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
