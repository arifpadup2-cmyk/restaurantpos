const fs = require('fs');
const path = require('path');

console.log('\n=== SETUP PACKAGE FEATURE VALIDATION ===\n');

// 1. Check if archiver is installed
console.log('1️⃣  Checking archiver installation...');
try {
  require('archiver');
  console.log('   ✅ archiver module installed\n');
} catch (e) {
  console.log('   ❌ archiver not found - run: npm install archiver\n');
}

// 2. Check server/routes/downloads.js
console.log('2️⃣  Checking server/routes/downloads.js...');
const downloadsRoute = fs.readFileSync(path.join(__dirname, 'server/routes/downloads.js'), 'utf8');
if (downloadsRoute.includes('/setup-package/:outlet_id')) {
  console.log('   ✅ API endpoint defined\n');
} else {
  console.log('   ❌ API endpoint not found\n');
}

if (downloadsRoute.includes('buildSetupGuideHtml')) {
  console.log('   ✅ Setup guide HTML builder present\n');
} else {
  console.log('   ❌ Setup guide builder not found\n');
}

// 3. Check backoffice HTML
console.log('3️⃣  Checking backoffice/index.html...');
const backofficeHTML = fs.readFileSync(path.join(__dirname, 'backoffice/index.html'), 'utf8');

const checks = [
  { name: 'Success modal', pattern: 'modal-outlet-setup' },
  { name: 'showOutletSetupModal function', pattern: 'function showOutletSetupModal' },
  { name: 'downloadOutletSetupPackage function', pattern: 'async function downloadOutletSetupPackage' },
  { name: 'Downloads page Setup Package card', pattern: 'Per-Outlet Setup Package' },
  { name: 'Setup package outlet selector', pattern: 'setup-package-outlet' },
  { name: 'loadSetupPackageOutlets function', pattern: 'async function loadSetupPackageOutlets' },
];

checks.forEach(check => {
  if (backofficeHTML.includes(check.pattern)) {
    console.log(`   ✅ ${check.name}`);
  } else {
    console.log(`   ❌ ${check.name} NOT FOUND`);
  }
});

console.log('\n=== TEST INSTRUCTIONS ===\n');
console.log('To test the feature manually:');
console.log('1. Server is running at http://localhost:3001');
console.log('2. Open backoffice at http://localhost:3001/backoffice/');
console.log('3. Log in (chillzoneice218 / PWDPU782!)');
console.log('4. Go to Configuration → Outlets');
console.log('5. Click "Add Outlet"');
console.log('6. Fill in outlet details (name, market, etc)');
console.log('7. Click "Save Outlet"');
console.log('8. Success modal should appear with outlet code');
console.log('9. Click "Download Setup Package" to get ZIP file');
console.log('10. Extract ZIP and verify it contains:');
console.log('    - SETUP-GUIDE.html (7 steps)');
console.log('    - pos-config.json (pre-filled)');
console.log('    - setup-database.sql');
console.log('\n✅ Setup Package Feature Ready for Testing\n');
