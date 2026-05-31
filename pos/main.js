require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const https = require('https');
const http  = require('http');
const { validateRendererSql } = require('./sql-guard');

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

// ── Renderer SQL guard (Phase 0 hardening) — see sql-guard.js ──────────────────
// Guards a query; logs and throws on rejection so the IPC handler's catch returns
// { ok:false } to the renderer.
function guardSql(query) {
  const reason = validateRendererSql(query);
  if (reason) {
    const snippet = String(query).slice(0, 200).replace(/\s+/g, ' ');
    console.error(`[SQL-GUARD] blocked (${reason}): ${snippet}`);
    throw new Error(`Query rejected by SQL guard: ${reason}`);
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('db-all', async (_e, query, params = []) => {
  try {
    guardSql(query);
    const data = await dbAll(query, params);
    return { ok: true, data: Array.from(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('db-get', async (_e, query, params = []) => {
  try {
    guardSql(query);
    const data = await dbGet(query, params);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('db-run', async (_e, query, params = []) => {
  try {
    guardSql(query);
    const result = await dbRun(query, params);
    return { ok: true, changes: parseInt(result?.count ?? 1) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('db-tx', async (_e, ops) => {
  try {
    if (!Array.isArray(ops)) throw new Error('db-tx expects an array of ops');
    for (const op of ops) guardSql(op?.sql);
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

ipcMain.handle('quit-app', () => { app.quit(); });
ipcMain.handle('minimize-app', () => { if (mainWindow) mainWindow.minimize(); });

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
    fullscreen: true,          // always open in full screen
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    title: 'Restaurant POS',
  });
  // Re-assert full screen once the window is ready (covers platforms that ignore the flag).
  mainWindow.once('ready-to-show', () => mainWindow.setFullScreen(true));
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

// ── Print templates — all 80mm. 3 KOT designs + 3 Bill designs, Arabic-aware. ──
// Each item may carry an Arabic name (name_ar / item_name_ar) rendered RTL.
function _esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _arName(i) {
  const na = i.name_ar || i.item_name_ar || i.nameAr;
  return na ? `<div dir="rtl" style="font-family:'Tahoma','Arial',sans-serif;font-weight:bold">${_esc(na)}</div>` : '';
}
function _itemName(i) { return _esc(i.name || i.item_name || ''); }
function _mods(i) {
  return Array.isArray(i.modifiers) && i.modifiers.length
    ? i.modifiers.map(m => `+ ${_esc(m.name)}`).join(', ') : '';
}

// ===== KOT =====
function buildKOTHTML(d) {
  const fn = { 2: kotDesign2, 3: kotDesign3 }[Number(d.design)] || kotDesign1;
  return fn(d);
}
function _kotShell(inner, extraCss = '') {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}body{font-family:monospace;padding:8px;width:300px;margin:0}
.c{text-align:center}.b{font-weight:bold}.div{border-top:2px dashed #000;margin:8px 0}
table{width:100%;border-collapse:collapse}${extraCss}</style></head><body>${inner}</body></html>`;
}
function kotDesign1(d) {   // Standard
  const type = (d.orderType||'').toUpperCase().replace('-',' ');
  const rows = (d.items||[]).map(i => `<tr style="border-bottom:1px dashed #aaa">
    <td style="font-size:16px;font-weight:bold;padding:5px 3px">${_itemName(i)}${i.variantName?` [${_esc(i.variantName)}]`:''}${_arName(i)}${_mods(i)?`<br><span style="font-size:11px;font-weight:normal">${_mods(i)}</span>`:''}${i.notes?`<br><span style="font-size:11px;font-style:italic">* ${_esc(i.notes)}</span>`:''}</td>
    <td style="font-size:16px;font-weight:bold;text-align:right;padding:5px 3px;white-space:nowrap">x${i.qty||i.quantity}</td></tr>`).join('');
  return _kotShell(`<div class="c b" style="font-size:20px;margin:6px 0">★ K O T ★</div>
${d.kotNumber?`<p class="c b" style="font-size:18px;margin:3px 0">KOT #${d.kotNumber}</p>`:''}
<p class="c" style="margin:3px 0">Order #${d.orderNumber} — ${type}</p>
<p class="c" style="margin:3px 0">${new Date(d.createdAt).toLocaleTimeString()}</p>
${d.tableName?`<p class="c b" style="font-size:15px;margin:3px 0">TABLE: ${_esc(d.tableName)}</p>`:''}
${d.customerName?`<p class="c" style="margin:3px 0">${_esc(d.customerName)}</p>`:''}
<div class="div"></div><table>${rows}</table><div class="div"></div>
<p class="c">Cashier: ${_esc(d.cashierName)}</p>`);
}
function kotDesign2(d) {   // Bold / large (busy kitchens)
  const type = (d.orderType||'').toUpperCase().replace('-',' ');
  const rows = (d.items||[]).map(i => `<div style="border-bottom:1px solid #000;padding:7px 0">
    <div style="display:flex;justify-content:space-between"><span style="font-size:19px;font-weight:bold">${_itemName(i)}</span><span style="font-size:19px;font-weight:bold">x${i.qty||i.quantity}</span></div>
    ${_arName(i)?`<div style="font-size:16px">${_arName(i)}</div>`:''}
    ${i.variantName?`<div style="font-size:13px">[${_esc(i.variantName)}]</div>`:''}${_mods(i)?`<div style="font-size:13px">${_mods(i)}</div>`:''}${i.notes?`<div style="font-size:13px;font-style:italic">* ${_esc(i.notes)}</div>`:''}</div>`).join('');
  return _kotShell(`<div class="c b" style="font-size:26px;border:3px solid #000;padding:6px;margin-bottom:6px">KITCHEN ORDER</div>
${d.tableName?`<div class="c b" style="font-size:22px;margin:4px 0">TABLE ${_esc(d.tableName)}</div>`:`<div class="c b" style="font-size:18px;margin:4px 0">${type}</div>`}
<div class="c" style="font-size:13px">#${d.orderNumber}${d.kotNumber?` · KOT ${d.kotNumber}`:''} · ${new Date(d.createdAt).toLocaleTimeString()}</div>
<div class="div"></div>${rows}<div class="div"></div>
<div class="c" style="font-size:12px">${_esc(d.cashierName)}</div>`, 'body{font-size:14px}');
}
function kotDesign3(d) {   // Compact
  const rows = (d.items||[]).map(i => `<tr><td style="padding:2px 0">${i.qty||i.quantity} × ${_itemName(i)}${_arName(i)}</td></tr>`).join('');
  return _kotShell(`<div class="c b" style="font-size:15px">KOT #${d.kotNumber||d.orderNumber}</div>
<div class="c" style="font-size:12px">${d.tableName?`T:${_esc(d.tableName)} · `:''}${new Date(d.createdAt).toLocaleTimeString()}</div>
<div class="div" style="margin:5px 0"></div><table style="font-size:14px;font-weight:bold">${rows}</table>`, 'body{font-size:12px;padding:6px}');
}

// ===== BILL =====
function buildReceiptHTML(d) {
  const fn = { 2: billDesign2, 3: billDesign3 }[Number(d.design)] || billDesign1;
  return fn(d);
}
function _payLines(d) {
  if (d.isDraft) return '';
  let s = '';
  if (Array.isArray(d.paymentLines) && d.paymentLines.length) {
    // Split payment: show each tender separately.
    for (const p of d.paymentLines)
      s += `<tr><td>Paid (${_esc(p.method)})</td><td align="right">${d.currency}${parseFloat(p.amount||0).toFixed(2)}</td></tr>`;
  } else if (d.paymentMethod) {
    s += `<tr><td>Paid (${_esc(d.paymentMethod)})</td><td align="right">${d.currency}${parseFloat(d.paymentReceived||0).toFixed(2)}</td></tr>`;
  } else {
    return '';
  }
  if (d.changeAmount > 0) s += `<tr><td>Change</td><td align="right">${d.currency}${parseFloat(d.changeAmount).toFixed(2)}</td></tr>`;
  return s;
}
function billDesign1(d) {   // Classic (monospace)
  const rows = (d.items||[]).map(i => `<tr><td>${_itemName(i)}${i.variantName?` [${_esc(i.variantName)}]`:''}${_arName(i)}${_mods(i)?`<br><span style="font-size:11px">${_mods(i)}</span>`:''}</td><td>${i.quantity}</td><td>${d.currency}${parseFloat(i.unit_price).toFixed(2)}</td><td>${d.currency}${parseFloat(i.total_price).toFixed(2)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:12px;padding:10px;width:300px;margin:0}
h2,p{text-align:center;margin:3px 0}table{width:100%;border-collapse:collapse}td,th{padding:2px 3px}.div{border-top:1px dashed #000;margin:6px 0}.bold{font-weight:bold}</style></head><body>
<h2>${_esc(d.restaurantName)}</h2>
${d.isDraft?`<p class="bold" style="border:2px dashed #000;padding:4px">** DRAFT BILL **</p>`:''}
<p>Invoice #${d.orderNumber}</p><p>${new Date(d.billedAt).toLocaleString()}</p>
<p>${(d.orderType||'').toUpperCase()} | ${_esc(d.cashierName)}</p>
${d.tableName?`<p>Table: ${_esc(d.tableName)}</p>`:''}${d.customerName?`<p>Customer: ${_esc(d.customerName)}</p>`:''}
<div class="div"></div><table><tr><th align="left">Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${rows}</table><div class="div"></div>
<table><tr><td>Subtotal</td><td align="right">${d.currency}${parseFloat(d.subtotal).toFixed(2)}</td></tr>
${d.taxAmount>0?`<tr><td>Tax(${d.taxRate}%)</td><td align="right">${d.currency}${parseFloat(d.taxAmount).toFixed(2)}</td></tr>`:''}
${d.discountAmount>0?`<tr><td>Discount</td><td align="right">-${d.currency}${parseFloat(d.discountAmount).toFixed(2)}</td></tr>`:''}
<tr class="bold"><td>TOTAL</td><td align="right">${d.currency}${parseFloat(d.total).toFixed(2)}</td></tr>${_payLines(d)}</table>
<div class="div"></div><p>${_esc(d.receiptFooter)}</p></body></html>`;
}
function billDesign2(d) {   // Modern (sans-serif, boxed total)
  const rows = (d.items||[]).map(i => `<tr style="border-bottom:1px solid #eee"><td style="padding:4px 0">${_itemName(i)} <span style="color:#666">×${i.quantity}</span>${_arName(i)}${i.variantName?`<div style="font-size:11px;color:#666">[${_esc(i.variantName)}]</div>`:''}</td><td align="right" style="padding:4px 0;white-space:nowrap">${d.currency}${parseFloat(i.total_price).toFixed(2)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;padding:10px;width:300px;margin:0}
table{width:100%;border-collapse:collapse}.c{text-align:center}</style></head><body>
<div class="c" style="font-size:20px;font-weight:800;letter-spacing:1px">${_esc(d.restaurantName)}</div>
<div class="c" style="border-top:3px solid #000;border-bottom:3px solid #000;padding:4px;margin:8px 0;font-weight:700">TAX INVOICE</div>
${d.isDraft?`<div class="c" style="font-weight:bold">** DRAFT **</div>`:''}
<div style="font-size:11px;color:#444">Invoice: <b>#${d.orderNumber}</b><br>${new Date(d.billedAt).toLocaleString()}<br>${(d.orderType||'').toUpperCase()} · Cashier: ${_esc(d.cashierName)}${d.tableName?`<br>Table: ${_esc(d.tableName)}`:''}${d.customerName?`<br>Customer: ${_esc(d.customerName)}`:''}</div>
<table style="margin-top:8px">${rows}</table>
<table style="margin-top:8px;border-top:1px dashed #000;padding-top:6px">
<tr><td>Subtotal</td><td align="right">${d.currency}${parseFloat(d.subtotal).toFixed(2)}</td></tr>
${d.taxAmount>0?`<tr><td>Tax (${d.taxRate}%)</td><td align="right">${d.currency}${parseFloat(d.taxAmount).toFixed(2)}</td></tr>`:''}
${d.discountAmount>0?`<tr><td>Discount</td><td align="right">-${d.currency}${parseFloat(d.discountAmount).toFixed(2)}</td></tr>`:''}</table>
<div style="background:#000;color:#fff;display:flex;justify-content:space-between;padding:7px 10px;margin-top:6px;font-size:16px;font-weight:800"><span>TOTAL</span><span>${d.currency}${parseFloat(d.total).toFixed(2)}</span></div>
<table style="margin-top:6px">${_payLines(d)}</table>
<div class="c" style="margin-top:10px;font-size:11px;color:#444">${_esc(d.receiptFooter)}</div></body></html>`;
}
function billDesign3(d) {   // Detailed (full invoice fields + Arabic)
  const rows = (d.items||[]).map(i => `<tr style="border-bottom:1px dotted #ccc"><td style="padding:3px 0">${_itemName(i)}${_arName(i)}${i.variantName?` [${_esc(i.variantName)}]`:''}</td><td align="center">${i.quantity}</td><td align="right">${d.currency}${parseFloat(i.unit_price).toFixed(2)}</td><td align="right">${d.currency}${parseFloat(i.total_price).toFixed(2)}</td></tr>`).join('');
  const meta = [
    ['Invoice #', d.orderNumber],
    ['Order time', d.createdAt ? new Date(d.createdAt).toLocaleString() : ''],
    ['Completed', d.completedAt ? new Date(d.completedAt).toLocaleString() : ''],
    ['Payment time', d.billedAt ? new Date(d.billedAt).toLocaleString() : ''],
    ['Order type', (d.orderType||'').toUpperCase()],
    ['Cashier', d.cashierName],
    ['Waiter', d.waiterName],
    ['Customer', d.customerName],
    ['Phone', d.customerPhone],
    ['Table', d.tableName],
  ].filter(([,v]) => v).map(([k,v]) => `<tr><td style="color:#555">${k}</td><td align="right">${_esc(v)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;padding:10px;width:300px;margin:0}
table{width:100%;border-collapse:collapse}td,th{padding:1px 2px}.c{text-align:center}.bold{font-weight:bold}</style></head><body>
<div class="c bold" style="font-size:18px">${_esc(d.restaurantName)}</div>
<div class="c bold" style="font-size:13px;margin:4px 0">TAX INVOICE</div>
${d.isDraft?`<div class="c bold">** DRAFT **</div>`:''}
<table style="margin:6px 0">${meta}</table>
<table style="border-top:1px solid #000;border-bottom:1px solid #000;margin-top:4px"><tr class="bold"><th align="left">Item</th><th>Qty</th><th align="right">Rate</th><th align="right">Amt</th></tr>${rows}</table>
<table style="margin-top:6px">
<tr><td>Gross</td><td align="right">${d.currency}${parseFloat(d.subtotal).toFixed(2)}</td></tr>
${d.discountAmount>0?`<tr><td>Discount</td><td align="right">-${d.currency}${parseFloat(d.discountAmount).toFixed(2)}</td></tr>`:''}
${d.compAmount>0?`<tr><td>Complimentary</td><td align="right">-${d.currency}${parseFloat(d.compAmount).toFixed(2)}</td></tr>`:''}
${d.cancelledAmount>0?`<tr><td style="color:#999">Cancelled (not charged)</td><td align="right" style="color:#999">${d.currency}${parseFloat(d.cancelledAmount).toFixed(2)}</td></tr>`:''}
${d.taxAmount>0?`<tr><td>Tax (${d.taxRate}%)</td><td align="right">${d.currency}${parseFloat(d.taxAmount).toFixed(2)}</td></tr>`:''}
${d.serviceChargeAmount>0?`<tr><td>Service charge</td><td align="right">${d.currency}${parseFloat(d.serviceChargeAmount).toFixed(2)}</td></tr>`:''}
<tr class="bold" style="font-size:14px;border-top:1px solid #000"><td>TOTAL</td><td align="right">${d.currency}${parseFloat(d.total).toFixed(2)}</td></tr>${_payLines(d)}</table>
<div class="c" style="margin-top:8px">${_esc(d.receiptFooter)}</div></body></html>`;
}
