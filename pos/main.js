require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const https = require('https');
const http  = require('http');

let mainWindow;
let sql; // postgres connection pool

const API_KEY = process.env.API_KEY || '';

// ── Persistent config (userData/pos-config.json) ──────────────────────────────
function getConfigPath() {
  return path.join(app.getPath('userData'), 'pos-config.json');
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')); }
  catch { return {}; }
}
function writeConfig(obj) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(obj, null, 2));
}

// ── Notify API server (fire-and-forget) ───────────────────────────────────────
// Called after direct DB writes so Socket.io can push to KDS / waiter apps.

function notifyServer (event, payload) {
  const cfg    = readConfig();
  const API_URL = (cfg.connectionMode === 'cloud' && cfg.cloudApiUrl)
    ? cfg.cloudApiUrl
    : (cfg.serverIp ? `http://${cfg.serverIp}:3001` : (process.env.API_URL || ''));
  if (!API_URL) return;
  try {
    const body    = JSON.stringify({ event, payload });
    const url     = new URL('/internal/notify', API_URL);
    const lib     = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key':      API_KEY,
      },
    };
    const req = lib.request(options);
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

// ── Database init ─────────────────────────────────────────────────────────────

async function initDB(cfg = {}) {
  const postgres = require('postgres');

  if (sql) { try { await sql.end({ timeout: 3 }); } catch {} sql = null; }

  const useSSL = (cfg.dbSsl ?? process.env.DB_SSL) === 'true'
  sql = postgres({
    host:     cfg.dbHost  || cfg.serverIp || process.env.DB_HOST || '127.0.0.1',
    port:     parseInt(cfg.dbPort || process.env.DB_PORT || '5432', 10),
    database: cfg.dbName   || process.env.DB_NAME || 'restaurant_pos_central',
    user:     cfg.dbUser   || process.env.DB_USER || 'pos_central_user',
    password: cfg.dbPass   || process.env.DB_PASS || '',
    ssl:      useSSL ? { rejectUnauthorized: false } : false,
    max:      5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  await sql`SELECT 1`;

  // Run pending migrations
  await runMigrations();

  // Seed default tables layout (runs once — skips if rows exist)
  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM tables_layout`;
  if (c === 0) {
    const tableRows = Array.from({ length: 12 }, (_, i) => ({
      id: `table-${i + 1}`, name: `T${i + 1}`, capacity: 4,
      status: 'available', current_order_id: null,
    }));
    await sql`INSERT INTO tables_layout ${sql(tableRows)}`;
  }

  // Seed default settings — use brand_id='' outlet_id='' for global defaults
  // (settings table has composite PK: brand_id, outlet_id, key)
  const defaults = [
    { key: 'restaurant_name',         value: 'My Restaurant' },
    { key: 'tax_rate',                value: '10' },
    { key: 'currency',                value: 'RM' },
    { key: 'receipt_footer',          value: 'Thank you! Please come again.' },
    { key: 'day_order_counter',       value: '0' },
    { key: 'last_counter_date',       value: '' },
    { key: 'api_url',                 value: '' },
    { key: 'api_key',                 value: '' },
    { key: 'is_print_station',        value: 'false' },
    { key: 'service_charge_rate',     value: '0' },
    { key: 'service_charge_label',    value: 'Service Charge' },
    { key: 'mgr_discount_threshold',  value: '10' },
    { key: 'require_void_reason',     value: '1' },
    { key: 'branch_name',             value: '' },
    { key: 'cash_variance_alert_pct', value: '5' },
  ];
  for (const row of defaults) {
    await sql`
      INSERT INTO settings (brand_id, outlet_id, key, value) VALUES ('', '', ${row.key}, ${row.value})
      ON CONFLICT (brand_id, outlet_id, key) DO NOTHING`;
  }
}

// ── Migrations ────────────────────────────────────────────────────────────────

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql') && !f.includes('sync_queue'))
    .sort();

  // Use same schema_migrations table + version column as server
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  const rows = await sql`SELECT version FROM schema_migrations`;
  const ran  = new Set(rows.map(r => r.version));

  for (const file of files) {
    const version = file.replace('.sql', '');
    if (ran.has(version)) continue;
    const sqlText = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await sql.begin(async t => {
      await t.unsafe(sqlText);
      await t`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });
    console.log(`  ✓ pos migration: ${file}`);
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

async function dbAll(query, params = []) {
  const pgQuery = convertPlaceholders(query);
  return sql.unsafe(pgQuery, params);
}

async function dbGet(query, params = []) {
  const pgQuery = convertPlaceholders(query);
  const rows = await sql.unsafe(pgQuery, params);
  return rows[0] ?? null;
}

async function dbRun(query, params = []) {
  const pgQuery = convertPlaceholders(query);
  return sql.unsafe(pgQuery, params);
}

async function dbTx(ops) {
  await sql.begin(async (tx) => {
    for (const op of ops) {
      const pgQuery = convertPlaceholders(op.sql);
      await tx.unsafe(pgQuery, op.params || []);
    }
  });
}

function convertPlaceholders(query) {
  let i = 0;
  let q = query.trim().replace(/\?/g, () => `$${++i}`);

  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(q)) {
    q = q.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
    if (!q.includes('ON CONFLICT'))
      q = q.replace(/\s*;?\s*$/, ' ON CONFLICT DO NOTHING');
  }

  const replaceMatch = q.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (replaceMatch) {
    const table     = replaceMatch[1].toLowerCase();
    const cols      = replaceMatch[2].split(',').map(c => c.trim());
    const pk        = table === 'settings' ? 'key' : 'id';
    const nonPkCols = cols.filter(c => c !== pk);
    const setClause = nonPkCols.length
      ? nonPkCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')
      : `${pk} = EXCLUDED.${pk}`;
    q = q.replace(/INSERT\s+OR\s+REPLACE\s+INTO/i, 'INSERT INTO');
    if (!q.includes('ON CONFLICT'))
      q = q.replace(/\s*;?\s*$/, ` ON CONFLICT (${pk}) DO UPDATE SET ${setClause}`);
  }

  return q;
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('db-all', async (_e, query, params = []) => {
  try {
    const data = await dbAll(query, params);
    return { ok: true, data: Array.from(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('db-get', async (_e, query, params = []) => {
  try {
    const data = await dbGet(query, params);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('db-run', async (_e, query, params = []) => {
  try {
    const result = await dbRun(query, params);
    return { ok: true, changes: parseInt(result?.count ?? 1) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('db-tx', async (_e, ops) => {
  try {
    await dbTx(ops);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Notify API server to broadcast Socket.io event to KDS/waiter apps
ipcMain.handle('notify-server', (_e, event, payload) => {
  notifyServer(event, payload);
  return { ok: true };
});

// Expose machine identity to renderer
ipcMain.handle('get-machine-id', () => {
  const cfg = readConfig();
  return cfg.machineId || process.env.MACHINE_ID || 'POS-01';
});

// Expose cloud API URL to renderer
ipcMain.handle('get-cloud-api-url', () => {
  return process.env.CLOUD_API_URL || '';
});

// Expose real app version to renderer (so UI never shows a stale hardcoded version)
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-config', () => readConfig());

ipcMain.handle('save-config', async (_e, cfg) => {
  try {
    await initDB(cfg);
    writeConfig(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('test-connection', async (_e, cfg) => {
  const postgres = require('postgres');
  let testSql = null;
  try {
    testSql = postgres({
      host:     cfg.serverIp || '127.0.0.1',
      port:     parseInt(cfg.dbPort || '5432', 10),
      database: cfg.dbName   || 'restaurant_pos_central',
      user:     cfg.dbUser   || 'pos_central_user',
      password: cfg.dbPass   || '',
      max: 1, connect_timeout: 5,
    });
    const [{ c }] = await testSql`SELECT COUNT(*)::int AS c FROM cashiers`;
    return { ok: true, cashiers: c };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (testSql) testSql.end({ timeout: 2 }).catch(() => {});
  }
});

ipcMain.handle('reload-app', () => {
  if (mainWindow) mainWindow.reload();
});

ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

ipcMain.handle('toggle-fullscreen', () => {
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('get-printers', async () => {
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    return list.map(p => ({ name: p.name, isDefault: p.isDefault }));
  } catch { return []; }
});

ipcMain.handle('print-receipt', (_e, data) => {
  const win = new BrowserWindow({
    width: 420, height: 700, show: false,
    webPreferences: { contextIsolation: true },
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildReceiptHTML(data)));
  win.webContents.once('did-finish-load', () => {
    const opts = { silent: !!data.printerName, printBackground: false };
    if (data.printerName) opts.deviceName = data.printerName;
    win.webContents.print(opts, () => win.close());
  });
  return { ok: true };
});

ipcMain.handle('print-kot', (_e, data) => {
  const win = new BrowserWindow({
    width: 380, height: 500, show: false,
    webPreferences: { contextIsolation: true },
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildKOTHTML(data)));
  win.webContents.once('did-finish-load', () => {
    const opts = { silent: !!data.printerName, printBackground: false };
    if (data.printerName) opts.deviceName = data.printerName;
    win.webContents.print(opts, () => win.close());
  });
  return { ok: true };
});

ipcMain.handle('start-update-download', () => {
  try { if (autoUpdater) autoUpdater.downloadUpdate(); } catch (_) {}
});

ipcMain.handle('install-update', () => {
  try { if (autoUpdater) autoUpdater.quitAndInstall(); } catch (_) {}
});

ipcMain.handle('check-for-updates', () => {
  try { if (autoUpdater) autoUpdater.checkForUpdates().catch(() => {}); } catch (_) {}
});

// ── Auto-updater ──────────────────────────────────────────────────────────────

let autoUpdater = null;

function setupAutoUpdater(serverIp) {
  if (!serverIp) return;
  const updateUrl = `http://${serverIp}:3001/updates/`;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });
    autoUpdater.autoDownload    = false;     // ASK user first before downloading
    autoUpdater.autoInstallOnAppQuit = true;

    // Step 1: Update found → ask user
    autoUpdater.on('update-available', (info) => {
      if (mainWindow) mainWindow.webContents.send('update-available', { version: info.version });
    });

    // Step 2: Download progress → show to user
    autoUpdater.on('download-progress', (prog) => {
      if (mainWindow) mainWindow.webContents.send('download-progress', { percent: Math.round(prog.percent) });
    });

    // Step 3: Download done → ask to restart
    autoUpdater.on('update-downloaded', () => {
      if (mainWindow) mainWindow.webContents.send('update-ready');
    });

    autoUpdater.on('error', () => {}); // suppress update errors silently

    // Check on startup + every 4 hours
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
  } catch (_) {}
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1200, minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: 'Restaurant POS',
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  dialog.showErrorBox(
    'POS Already Running',
    'The Restaurant POS is already open on this computer.\n\nOnly one instance can run at a time.\nClose the existing window first.'
  );
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  if (!gotTheLock) return;
  const cfg = readConfig();
  if (cfg.serverIp) {
    try { await initDB(cfg); } catch (_) { /* renderer detects failure and shows setup */ }
  }
  createWindow();
  setupAutoUpdater(cfg.serverIp);
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (sql) await sql.end({ timeout: 3 });
  if (process.platform !== 'darwin') app.quit();
});

// ── Receipt / KOT HTML builders ───────────────────────────────────────────────

function buildKOTHTML(d) {
  const rows = (d.items || []).map(i => {
    const name     = i.name || i.item_name;
    const variant  = i.variantName ? ` [${i.variantName}]` : '';
    const mods     = Array.isArray(i.modifiers) && i.modifiers.length
      ? i.modifiers.map(m => `+ ${m.name}`).join(', ')
      : '';
    const noteText = i.notes || '';
    return `<tr>
      <td class="item">${name}${variant}${mods ? `<br><span style="font-size:11px;font-weight:normal">${mods}</span>` : ''}${noteText ? `<br><span style="font-size:11px;font-style:italic">* ${noteText}</span>` : ''}</td>
      <td class="qty">x${i.qty || i.quantity}</td>
    </tr>`;
  }).join('');
  const type = (d.orderType || '').toUpperCase().replace('-', ' ');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{font-family:monospace;font-size:13px;padding:10px;width:300px}
h2,p{text-align:center;margin:3px 0}
.kothead{font-size:20px;font-weight:bold;text-align:center;margin:6px 0}
table{width:100%;border-collapse:collapse;margin-top:6px}
.item{font-size:16px;font-weight:bold;padding:5px 3px}
.qty{font-size:16px;font-weight:bold;text-align:right;padding:5px 3px;white-space:nowrap}
tr{border-bottom:1px dashed #aaa}
.div{border-top:2px dashed #000;margin:8px 0}
</style></head><body>
<div class="kothead">★ K O T ★</div>
${d.kotNumber ? `<p style="font-size:18px;font-weight:bold">KOT #${d.kotNumber}</p>` : ''}
<p>Order #${d.orderNumber} — ${type}</p>
<p>${new Date(d.createdAt).toLocaleTimeString()}</p>
${d.tableName ? `<p style="font-size:15px;font-weight:bold">TABLE: ${d.tableName}</p>` : ''}
${d.customerName ? `<p>${d.customerName}</p>` : ''}
<div class="div"></div>
<table>${rows}</table>
<div class="div"></div>
<p>Cashier: ${d.cashierName}</p>
</body></html>`;
}

function buildReceiptHTML(d) {
  const rows = d.items.map(i => {
    const variant = i.variantName ? ` [${i.variantName}]` : '';
    const mods    = Array.isArray(i.modifiers) && i.modifiers.length
      ? `<br><span style="font-size:11px">${i.modifiers.map(m => `+ ${m.name}`).join(', ')}</span>`
      : '';
    return `<tr><td>${i.item_name}${variant}${mods}</td><td>${i.quantity}</td><td>${d.currency}${parseFloat(i.unit_price).toFixed(2)}</td><td>${d.currency}${parseFloat(i.total_price).toFixed(2)}</td></tr>`;
  }).join('');
  const draftHeader = d.isDraft
    ? `<p style="font-size:14px;font-weight:bold;border:2px dashed #000;padding:4px;margin:6px 0">** DRAFT BILL **</p>`
    : '';
  const payRow = !d.isDraft && d.paymentMethod
    ? `<tr><td>Paid(${d.paymentMethod})</td><td align="right">${d.currency}${parseFloat(d.paymentReceived).toFixed(2)}</td></tr>
       ${d.changeAmount > 0 ? `<tr><td>Change</td><td align="right">${d.currency}${parseFloat(d.changeAmount).toFixed(2)}</td></tr>` : ''}`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:monospace;font-size:12px;padding:10px;width:300px}
h2,p{text-align:center;margin:3px 0}table{width:100%;border-collapse:collapse}
td{padding:2px 3px}.div{border-top:1px dashed #000;margin:6px 0}
.bold{font-weight:bold}</style></head><body>
<h2>${d.restaurantName}</h2>
${draftHeader}
<p>Order #${d.orderNumber}</p>
<p>${new Date(d.billedAt).toLocaleString()}</p>
<p>${d.orderType.toUpperCase()} | ${d.cashierName}</p>
${d.tableName ? `<p>Table: ${d.tableName}</p>` : ''}
${d.customerName ? `<p>Customer: ${d.customerName}</p>` : ''}
<div class="div"></div>
<table><tr><th align="left">Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${rows}</table>
<div class="div"></div>
<table>
<tr><td>Subtotal</td><td align="right">${d.currency}${parseFloat(d.subtotal).toFixed(2)}</td></tr>
${d.taxAmount > 0 ? `<tr><td>Tax(${d.taxRate}%)</td><td align="right">${d.currency}${parseFloat(d.taxAmount).toFixed(2)}</td></tr>` : ''}
${d.discountAmount > 0 ? `<tr><td>Discount</td><td align="right">-${d.currency}${parseFloat(d.discountAmount).toFixed(2)}</td></tr>` : ''}
<tr class="bold"><td>TOTAL</td><td align="right">${d.currency}${parseFloat(d.total).toFixed(2)}</td></tr>
${payRow}
</table>
<div class="div"></div><p>${d.receiptFooter}</p>
</body></html>`;
}
