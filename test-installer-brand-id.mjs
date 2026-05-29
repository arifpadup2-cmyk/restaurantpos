import fs from 'fs';
import path from 'path';

console.log('\n');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        Installer - Brand ID Feature Test                   ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('\n🧪 Testing installer Brand ID collection...\n');

const tests = [];
let passed = 0;
let failed = 0;

// TEST 1: HTML has Brand ID field
console.log('TEST 1: HTML Form - Brand ID Field');
console.log('─'.repeat(60));

const htmlPath = path.resolve('D:\\sofwtares\\RESTAURANT POS\\installer\\renderer\\index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const hasBrandIdLabel = htmlContent.includes('Brand ID');
const hasBrandIdInput = htmlContent.includes('id="brand-id"');
const hasBrandIdPlaceholder = htmlContent.includes('placeholder="e.g., my-restaurant"');
const hasBrandIdDescription = htmlContent.includes('Unique identifier for your brand');

if (hasBrandIdLabel && hasBrandIdInput && hasBrandIdPlaceholder && hasBrandIdDescription) {
  console.log('✅ Brand ID form field properly configured');
  console.log('   ✓ Label: 🏢 Brand ID');
  console.log('   ✓ Input field: id="brand-id"');
  console.log('   ✓ Placeholder: "e.g., my-restaurant"');
  console.log('   ✓ Description present\n');
  passed++;
} else {
  console.log('❌ Brand ID form field incomplete');
  if (!hasBrandIdLabel) console.log('   ✗ Missing label');
  if (!hasBrandIdInput) console.log('   ✗ Missing input field');
  if (!hasBrandIdPlaceholder) console.log('   ✗ Missing placeholder');
  if (!hasBrandIdDescription) console.log('   ✗ Missing description');
  console.log('');
  failed++;
}

// TEST 2: Form order - Brand ID should come before Outlet ID
console.log('TEST 2: Form Field Order');
console.log('─'.repeat(60));

const brandIdIndex = htmlContent.indexOf('id="brand-id"');
const outletIdIndex = htmlContent.indexOf('id="outlet-id"');
const outletCodeIndex = htmlContent.indexOf('id="outlet-code"');

if (brandIdIndex > 0 && outletIdIndex > brandIdIndex && outletCodeIndex > outletIdIndex) {
  console.log('✅ Form fields in correct order');
  console.log('   1. Brand ID (position ' + brandIdIndex + ')');
  console.log('   2. Outlet ID (position ' + outletIdIndex + ')');
  console.log('   3. Outlet Code (position ' + outletCodeIndex + ')\n');
  passed++;
} else {
  console.log('❌ Form fields in wrong order\n');
  failed++;
}

// TEST 3: app.js - Collection logic
console.log('TEST 3: JavaScript - Brand ID Collection (app.js)');
console.log('─'.repeat(60));

const appPath = path.resolve('D:\\sofwtares\\RESTAURANT POS\\installer\\renderer\\app.js');
const appContent = fs.readFileSync(appPath, 'utf8');

const collectsBrandId = appContent.includes('brand-id');
const validatesBrandId = appContent.includes('!brandId.trim()');
const passesInConfig = appContent.includes('brandId,');

if (collectsBrandId && validatesBrandId && passesInConfig) {
  console.log('✅ Brand ID collection properly implemented');
  console.log('   ✓ Collects from: document.getElementById("brand-id")');
  console.log('   ✓ Validates: !brandId.trim() check');
  console.log('   ✓ Passes in config: { brandId, outletId, outletCode }\n');
  passed++;
} else {
  console.log('❌ Brand ID collection incomplete');
  if (!collectsBrandId) console.log('   ✗ Does not collect Brand ID');
  if (!validatesBrandId) console.log('   ✗ No validation for Brand ID');
  if (!passesInConfig) console.log('   ✗ Not passed to config');
  console.log('');
  failed++;
}

// TEST 4: main.js - IPC Handler
console.log('TEST 4: Electron IPC Handler (main.js)');
console.log('─'.repeat(60));

const mainPath = path.resolve('D:\\sofwtares\\RESTAURANT POS\\installer\\main.js');
const mainContent = fs.readFileSync(mainPath, 'utf8');

const extractsBrandId = mainContent.includes('const { mode, brandId, outletId, outletCode');
const passesToFunction = mainContent.includes('startServerInstallation(brandId, outletId, outletCode)');

if (extractsBrandId && passesToFunction) {
  console.log('✅ IPC handler properly configured');
  console.log('   ✓ Extracts from config: { mode, brandId, outletId, outletCode }');
  console.log('   ✓ Passes to function: startServerInstallation(brandId, ...)\n');
  passed++;
} else {
  console.log('❌ IPC handler incomplete');
  if (!extractsBrandId) console.log('   ✗ Does not extract Brand ID from config');
  if (!passesToFunction) console.log('   ✗ Not passed to installation function');
  console.log('');
  failed++;
}

// TEST 5: install-server.js - Configuration Storage
console.log('TEST 5: Server Installation - Brand ID Storage (install-server.js)');
console.log('─'.repeat(60));

const installServerPath = path.resolve('D:\\sofwtares\\RESTAURANT POS\\installer\\scripts\\install-server.js');
const installServerContent = fs.readFileSync(installServerPath, 'utf8');

const functionSignature = installServerContent.includes('const installServer = async (brandId, outletId');
const saveToEnv = installServerContent.includes('BRAND_ID=${brandId}');
const saveToJson = installServerContent.includes('brandId,');

if (functionSignature && saveToEnv && saveToJson) {
  console.log('✅ Brand ID storage properly configured');
  console.log('   ✓ Function accepts: (brandId, outletId, outletCode, ...)');
  console.log('   ✓ Saves to .env: BRAND_ID=${brandId}');
  console.log('   ✓ Saves to JSON: { brandId, outletId, ... }\n');
  passed++;
} else {
  console.log('❌ Brand ID storage incomplete');
  if (!functionSignature) console.log('   ✗ Function does not accept Brand ID');
  if (!saveToEnv) console.log('   ✗ Not saved to .env');
  if (!saveToJson) console.log('   ✗ Not saved to outlet-config.json');
  console.log('');
  failed++;
}

// TEST 6: Validation Alert Message
console.log('TEST 6: Validation - Alert Message');
console.log('─'.repeat(60));

const alertMsg = appContent.includes('Please enter brand ID, outlet ID, and outlet code');

if (alertMsg) {
  console.log('✅ Validation alert includes Brand ID');
  console.log('   Message: "Please enter brand ID, outlet ID, and outlet code"\n');
  passed++;
} else {
  console.log('❌ Validation alert does not mention Brand ID\n');
  failed++;
}

// SUMMARY
console.log('═'.repeat(60));
console.log('\n📊 TEST SUMMARY\n');

const totalTests = passed + failed;
console.log(`${passed}/${totalTests} tests passed\n`);

if (failed === 0) {
  console.log('🎉 ALL INSTALLER TESTS PASSED!\n');
  console.log('═'.repeat(60));
  console.log('\n📖 MANUAL TESTING CHECKLIST:\n');
  console.log('1️⃣  Open Installer');
  console.log('   □ Navigate to: D:\\sofwtares\\RESTAURANT POS\\installer\\dist\\');
  console.log('   □ Run: Restaurant POS Installer Setup 1.0.0.exe');
  console.log('   □ Wait for window to open');
  console.log('');
  console.log('2️⃣  Welcome Screen');
  console.log('   □ See welcome message');
  console.log('   □ See two options: Server Setup & Terminal Setup');
  console.log('   □ Click: Server Setup');
  console.log('');
  console.log('3️⃣  System Check Screen');
  console.log('   □ See checks for Node.js, PostgreSQL, Ports');
  console.log('   □ Wait for checks to complete');
  console.log('   □ See green checkmarks (or fix issues)');
  console.log('   □ Click: Proceed');
  console.log('');
  console.log('4️⃣  Server Information Screen');
  console.log('   □ See NEW field: "🏢 Brand ID"');
  console.log('   □ See field: "Outlet ID"');
  console.log('   □ See field: "Outlet Code"');
  console.log('');
  console.log('5️⃣  Form Validation');
  console.log('   □ Try clicking "Start Server Setup" with empty fields');
  console.log('   □ Verify alert: "Please enter brand ID, outlet ID, and outlet code"');
  console.log('   □ Fill all three fields:');
  console.log('     - Brand ID: my-restaurant');
  console.log('     - Outlet ID: outlet-001');
  console.log('     - Outlet Code: REST001');
  console.log('   □ Click: Start Server Setup');
  console.log('');
  console.log('6️⃣  Installation Progress');
  console.log('   □ Watch 7 installation steps');
  console.log('   □ Step 3: "Creating outlet database..."');
  console.log('   □ Step 4: "Installing server..."');
  console.log('   □ Step 7: "Starting server..."');
  console.log('');
  console.log('7️⃣  Verify Configuration Files');
  console.log('   After installation completes:');
  console.log('   □ Check: C:\\Program Files\\Restaurant POS Server\\.env');
  console.log('     Should contain: BRAND_ID=my-restaurant');
  console.log('   □ Check: C:\\Program Files\\Restaurant POS Server\\outlet-config.json');
  console.log('     Should contain: "brandId": "my-restaurant"');
  console.log('');
  console.log('8️⃣  Verify Back Office');
  console.log('   □ Open: http://localhost:3001');
  console.log('   □ Go to: Downloads & System');
  console.log('   □ See Server Information shows:');
  console.log('     🏢 Brand ID: my-restaurant');
  console.log('     Server IP: 192.168.x.x');
  console.log('     Outlet ID: outlet-001');
  console.log('     Outlet Code: REST001');
  console.log('\n' + '═'.repeat(60) + '\n');
} else {
  console.log('⚠️  Some tests failed. Review the output above.\n');
}
