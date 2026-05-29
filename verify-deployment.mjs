#!/usr/bin/env node

import http from 'http';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const tests = [];
let passed = 0;
let failed = 0;

const test = (name, fn) => tests.push({ name, fn });
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log('\n');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     RESTAURANT POS v3.10.0 - DEPLOYMENT VERIFICATION      ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('\n🧪 Running post-deployment checks...\n');

// TEST 1: Check Server IP is accessible
test('Server: Can reach API at http://{ip}:3001', async (serverIp) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: serverIp,
      port: 3001,
      path: '/api/downloads/info',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 401) {
        resolve(`✅ Server is running at http://${serverIp}:3001`);
      } else {
        reject(new Error(`Unexpected status code: ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      reject(new Error(`Cannot connect to server: ${err.message}`));
    });

    req.end();
  });
});

// TEST 2: Check Back Office is accessible
test('Back Office: Web interface is accessible', async (serverIp) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: serverIp,
      port: 3001,
      path: '/backoffice/',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 301) {
        resolve(`✅ Back Office accessible at http://${serverIp}:3001`);
      } else {
        reject(new Error(`Unexpected status: ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      reject(new Error(`Cannot reach Back Office: ${err.message}`));
    });

    req.end();
  });
});

// TEST 3: Check Installer is available
test('Downloads: Installer is available for terminals', async (serverIp) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: serverIp,
      port: 3001,
      path: '/api/downloads/installer/info',
      method: 'GET',
      timeout: 5000,
      headers: {
        'Authorization': 'Bearer dummy-token'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const info = JSON.parse(data);
            resolve(`✅ Installer available (v${info.installer.version})`);
          } else if (res.statusCode === 401) {
            resolve(`✅ Endpoint is working (auth required as expected)`);
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Cannot check installer: ${err.message}`));
    });

    req.end();
  });
});

// TEST 4: System setup verification questions
async function runInteractiveTests(serverIp) {
  console.log('\n🔍 Verifying System Configuration...\n');

  const questions = [
    {
      name: 'postgresql',
      question: '✓ PostgreSQL installed on server PC? (y/n): ',
      expected: 'y'
    },
    {
      name: 'terminal_connected',
      question: '✓ Terminal PC(s) can see the POS app? (y/n): ',
      expected: 'y'
    },
    {
      name: 'back_office_login',
      question: '✓ Can login to Back Office (admin/Admin@1234)? (y/n): ',
      expected: 'y'
    },
    {
      name: 'test_order',
      question: '✓ Successfully placed a test order? (y/n): ',
      expected: 'y'
    },
    {
      name: 'day_close',
      question: '✓ Successfully closed a test day? (y/n): ',
      expected: 'y'
    }
  ];

  const results = {};

  for (const q of questions) {
    const answer = await new Promise(resolve => {
      rl.question(q.question, resolve);
    });

    results[q.name] = answer.toLowerCase() === q.expected;
    if (results[q.name]) {
      console.log(`   ✅ ${q.name.replace(/_/g, ' ').toUpperCase()}`);
    } else {
      console.log(`   ❌ ${q.name.replace(/_/g, ' ').toUpperCase()} - Check troubleshooting guide`);
    }
  }

  return results;
}

// TEST 5: System health score
function calculateHealthScore(apiTests, interactiveTests) {
  const apiScore = apiTests.filter(r => r.passed).length / apiTests.length * 50;
  const interactiveScore = Object.values(interactiveTests).filter(r => r).length / Object.keys(interactiveTests).length * 50;
  return Math.round(apiScore + interactiveScore);
}

// Main execution
async function runVerification() {
  rl.question('📍 Enter Server IP Address (e.g., 192.168.1.100): ', async (serverIp) => {
    console.log(`\n🔄 Testing connection to ${serverIp}...\n`);

    const apiResults = [];

    // Run API tests
    for (const { name, fn } of tests) {
      try {
        const result = await fn(serverIp);
        console.log(`✅ ${name}`);
        console.log(`   ${result}\n`);
        apiResults.push({ name, passed: true });
        passed++;
      } catch (e) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${e.message}\n`);
        apiResults.push({ name, passed: false });
        failed++;
      }
    }

    // Run interactive tests
    const interactiveResults = await runInteractiveTests(serverIp);

    // Calculate health score
    const healthScore = calculateHealthScore(apiResults, interactiveResults);

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('\n📊 DEPLOYMENT VERIFICATION SUMMARY\n');

    console.log(`API Tests: ${apiResults.filter(r => r.passed).length}/${apiResults.length} passed`);
    console.log(`Configuration: ${Object.values(interactiveResults).filter(r => r).length}/${Object.keys(interactiveResults).length} confirmed`);
    console.log(`\nSystem Health Score: ${healthScore}/100`);

    if (healthScore >= 90) {
      console.log('\n🎉 DEPLOYMENT SUCCESSFUL!\n');
      console.log('Your Restaurant POS system is ready to use!');
      console.log('\n✅ Next Steps:');
      console.log('   1. Train staff on POS operation');
      console.log('   2. Configure menu items in Back Office');
      console.log('   3. Set up printers (if not done)');
      console.log('   4. Change admin password (security!)');
      console.log('   5. Start taking real orders');
    } else if (healthScore >= 70) {
      console.log('\n⚠️  SYSTEM MOSTLY WORKING\n');
      console.log('Some items need attention before going live.');
      console.log('\n📋 To Do:');
      if (!interactiveResults.postgresql) console.log('   - [ ] Verify PostgreSQL is installed');
      if (!interactiveResults.terminal_connected) console.log('   - [ ] Check terminal can connect to server');
      if (!interactiveResults.back_office_login) console.log('   - [ ] Verify Back Office login works');
      if (!interactiveResults.test_order) console.log('   - [ ] Test placing an order');
      if (!interactiveResults.day_close) console.log('   - [ ] Test closing a day');
    } else {
      console.log('\n❌ ISSUES DETECTED\n');
      console.log('Your system needs troubleshooting before use.');
      console.log('\n🆘 Please check:');
      console.log('   1. Server PC is running and connected to network');
      console.log('   2. PostgreSQL installation completed successfully');
      console.log('   3. Firewall is not blocking port 3001');
      console.log('   4. Server IP address is correct');
      console.log('   5. See DEPLOYMENT-GUIDE.md troubleshooting section');
    }

    console.log('\n' + '═'.repeat(60) + '\n');

    rl.close();
    process.exit(healthScore >= 70 ? 0 : 1);
  });
}

// Start verification
runVerification();
