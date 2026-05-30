require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const https = require('https');
const http  = require('http');

// ── Auto-update system (GitHub releases) ──────────────────────────────────────
const AutoUpdateMain = require('./auto-update-main');

// ── Logger ────────────────────────────────────────────────────────────────────
const logger   = require('./logger');
const uploader = require('./log-uploader');

let mainWindow;
let sql; // postgres connection pool

const API_KEY = process.env.API_KEY || '';

// Hook process-level errors before app is ready
process.on('uncaughtException',  (e) => logger.critical('main', '', 'uncaughtException', { error: e.message, stack: e.stack }));
process.on('unhandledRejection', (e) => logger.error('main', '', 'unhandledRejection', { error: String(e) }));

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
  logger.info('main', 'setup', 'db_init_start', { host: cfg.dbHost || cfg.serverIp, db: cfg.dbName });
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

  logger.info('main', 'setup', 'migrations_start');
  await runMigrations();
  logger.info('main', 'setup', 'migrations_complete');

  // Seed default tables layout (runs once — skips if rows exist)
  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM tables_layout`;
  if (c === 0) {
    const tableRows = Array.from({ length: 12 }, (_, i) => ({
      id: `table-${i + 1}`, name: `T${i + 1}`, capacity: 4,
      status: 'available', current_order_id: null,
      brand_id: '', outlet_id: '',
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
    logger.info('main', 'setup', 'migration_applied', { file });
  }
}

// ── Seed brand/market/outlet into LOCAL db ────────────────────────────────────
// When the POS connects to an outlet (esp. a cloud outlet), the LOCAL postgres
// won't have the brand/outlet rows. Menu categories have FK -> outlets and a
// brand_id NOT NULL check, so syncing categories fails until these exist.
async function seedOutletLocally(cfg = {}) {
  if (!sql || !cfg.brandId || !cfg.outletId) return;
  try {
    // Brand (defaults cover license_prefix, plan, status, etc.)
    await sql`
      INSERT INTO brands (id, name)
      VALUES (${cfg.brandId}, ${cfg.restaurantName || 'Restaurant'})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`;

    // Synthetic market for FK + NOT NULL satisfaction
    const marketId = 'mkt-' + cfg.outletId;
    await sql`
      INSERT INTO markets (id, brand_id, name)
      VALUES (${marketId}, ${cfg.brandId}, 'Default Market')
      ON CONFLICT (id) DO NOTHING`;

    // Outlet
    await sql`
      INSERT INTO outlets (id, brand_id, market_id, name, outlet_code)
      VALUES (${cfg.outletId}, ${cfg.brandId}, ${marketId},
              ${cfg.outletName || 'Outlet'}, ${cfg.outletCode || ''})
      ON CONFLICT (id) DO UPDATE
        SET brand_id = EXCLUDED.brand_id,
            market_id = EXCLUDED.market_id,
            name = EXCLUDED.name`;

    logger.info('main', 'setup', 'outlet_seeded_locally', { outletCode: cfg.outletCode, brandId: cfg.brandId });
  } catch (e) {
    logger.error('main', 'setup', 'seed_outlet_failed', { error: e.message });
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

ipcMain.handle('get-config', () => readConfig());

// ── Logging IPC ───────────────────────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('log-upload-now', async () => {
  try { await uploader.upload(); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('log-entry', (_e, level, module_name, screen, action, extra) => {
  logger.log(level || 'info', module_name || 'renderer', screen, action, extra);
});
ipcMain.handle('log-set-context', (_e, ctx) => {
  logger.setContext(ctx);
});
ipcMain.handle('log-list-files', () => logger.listLogFiles());
ipcMain.handle('log-read-file', (_e, filePath, lines) => logger.readLogFile(filePath, lines || 500));
ipcMain.handle('log-get-dir', () => logger.getLogDir());

ipcMain.handle('save-config', async (_e, cfg) => {
  logger.info('main', 'setup', 'save_config', { outletCode: cfg.outletCode, serverIp: cfg.serverIp, connectionMode: cfg.connectionMode });
  try {
    await initDB(cfg);
    // Update logger context once config is saved
    logger.setContext({
      outlet_code:   cfg.outletCode   || '',
      outlet_name:   cfg.outletName   || '',
      outlet_id:     cfg.outletId     || '',
      brand_id:      cfg.brandId      || '',
      brand_name:    cfg.restaurantName || '',
      terminal_name: cfg.machineId    || '',
    });
    logger.info('main', 'setup', 'db_init_complete', { outletCode: cfg.outletCode });
    // Seed brand/market/outlet into LOCAL db so menu sync (categories) satisfies FK + NOT NULL constraints
    await seedOutletLocally(cfg);
    writeConfig(cfg);
    // Update uploader with new server URL and api key
    const uploadBase = cfg.connectionMode === 'cloud' && cfg.cloudApiUrl
      ? cfg.cloudApiUrl
      : (cfg.serverIp ? `http://${cfg.serverIp}:3001` : '');
    uploader.setApiUrl(uploadBase);
    uploader.setApiKey(cfg.apiKey || process.env.API_KEY || '');
    setTimeout(() => uploader.upload(), 5000);
    return { ok: true };
  } catch (e) {
    logger.error('main', 'setup', 'db_init_failed', { error: e.message, stack: e.stack });
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

  // Initialize auto-update handler (GitHub releases)
  try {
    new AutoUpdateMain(mainWindow);
  } catch (e) {
    console.error('[AutoUpdate] Initialization error:', e.message);
  }
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

  // Init logger with outlet context from saved config
  logger.init(app.getPath('userData'), {
    outlet_code:   cfg.outletCode   || '',
    outlet_name:   cfg.outletName   || '',
    outlet_id:     cfg.outletId     || '',
    brand_id:      cfg.brandId      || '',
    brand_name:    cfg.restaurantName || '',
    terminal_name: cfg.machineId    || '',
  }, app.getVersion());

  logger.info('main', 'app', 'app_start', { version: app.getVersion(), platform: process.platform });

  if (cfg.serverIp) {
    try { await initDB(cfg); } catch (e) {
      logger.error('main', 'app', 'db_init_failed_on_startup', { error: e.message });
    }
  }

  // Init log uploader — upload to LOCAL server first, fallback to cloud
  const uploadBase = cfg.connectionMode === 'cloud' && cfg.cloudApiUrl
    ? cfg.cloudApiUrl
    : (cfg.serverIp ? `http://${cfg.serverIp}:3001` : '');
  uploader.init(app.getPath('userData'), uploadBase, cfg.apiKey || process.env.API_KEY || '');

  // Upload on startup (after short delay so app loads first)
  setTimeout(() => uploader.upload(), 8000);

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
