'use strict'

const archiver = require('archiver')
const express  = require('express')
const fs       = require('fs')
const path     = require('path')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, '..')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')
const UPDATES_DIR = path.join(DATA_DIR, 'updates')

module.exports = function downloadsRouter (sql) {
  const router = express.Router()

  // GET /downloads/info — server + DB info for POS setup screen
  router.get('/info', jwtAuth, async (req, res) => {
    try {
      const [dbInfo] = await sql`SELECT current_database() AS db, version() AS ver`
      const [counts] = await sql`
        SELECT
          (SELECT COUNT(*)::int FROM cashiers)   AS cashiers,
          (SELECT COUNT(*)::int FROM menu_items) AS menu_items,
          (SELECT COUNT(*)::int FROM orders)     AS orders,
          (SELECT COUNT(*)::int FROM categories) AS categories`
      res.json({
        ok: true,
        server: {
          host:    process.env.DB_HOST || '127.0.0.1',
          port:    parseInt(process.env.PORT || '3001', 10),
          db_name: process.env.DB_NAME || 'restaurant_pos_central',
          db_host: process.env.DB_HOST || '127.0.0.1',
          db_port: parseInt(process.env.DB_PORT || '5432', 10),
          db_user: process.env.DB_USER || 'pos_central_user',
          version: '2.0.0',
        },
        database: {
          name:       dbInfo.db,
          pg_version: dbInfo.ver.split(' ').slice(0, 2).join(' '),
        },
        counts,
      })
    } catch (e) { serverError(res, e) }
  })

  // GET /downloads/local-backups — list auto-backup files
  router.get('/local-backups', jwtAuth, (req, res) => {
    try {
      if (!fs.existsSync(BACKUPS_DIR)) return res.json({ files: [] })
      const files = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
        .map(f => {
          const stat = fs.statSync(path.join(BACKUPS_DIR, f))
          return { name: f, size: stat.size, modified: stat.mtime }
        })
        .sort((a, b) => new Date(b.modified) - new Date(a.modified))
        .slice(0, 30)
      res.json({ files })
    } catch (e) { serverError(res, e) }
  })

  // GET /downloads/local-backups/:filename — download specific auto-backup
  router.get('/local-backups/:filename', jwtAuth, (req, res) => {
    try {
      const safe = path.basename(req.params.filename)
      if (!safe.startsWith('backup-') || !safe.endsWith('.json'))
        return res.status(400).json({ error: 'Invalid filename' })
      const filepath = path.join(BACKUPS_DIR, safe)
      if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' })
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename="${safe}"`)
      fs.createReadStream(filepath).pipe(res)
    } catch (e) { serverError(res, e) }
  })

  // GET /downloads/files — list installer files in /updates/
  router.get('/files', jwtAuth, (req, res) => {
    try {
      if (!fs.existsSync(UPDATES_DIR)) return res.json({ files: [] })
      const files = fs.readdirSync(UPDATES_DIR)
        .filter(f => f.endsWith('.exe') || f.endsWith('.yml') || f.endsWith('.blockmap'))
        .map(f => {
          const stat = fs.statSync(path.join(UPDATES_DIR, f))
          return { name: f, size: stat.size, modified: stat.mtime }
        })
        .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      res.json({ files })
    } catch (e) { serverError(res, e) }
  })

  // GET /downloads/backup — full JSON export; ?outlet_id=X scopes to one outlet
  router.get('/backup', jwtAuth, async (req, res) => {
    try {
      const { outlet_id } = req.query
      const rid = req.user.brand_id || ''

      let orders, order_items, outlet_name = null
      if (outlet_id) {
        const [ol] = await sql`SELECT name FROM outlets WHERE id = ${outlet_id} AND brand_id = ${rid}`
        outlet_name = ol?.name || outlet_id
        orders      = await sql`SELECT * FROM orders       WHERE outlet_id = ${outlet_id} ORDER BY created_at`
        order_items = await sql`SELECT oi.* FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.outlet_id = ${outlet_id}`
      } else {
        orders      = await sql`SELECT * FROM orders ORDER BY created_at`
        order_items = await sql`SELECT * FROM order_items`
      }

      const [
        settings, cashiers, categories, menu_items, customers,
        shifts, expenses, day_closings, audit_log, no_sale_log, tables_layout, printers,
      ] = await Promise.all([
        sql`SELECT * FROM settings WHERE brand_id = ${rid}`,
        sql`SELECT * FROM cashiers`,
        sql`SELECT * FROM categories`,
        sql`SELECT * FROM menu_items`,
        sql`SELECT * FROM customers`,
        sql`SELECT * FROM shifts       ORDER BY opened_at`,
        sql`SELECT * FROM expenses     ORDER BY created_at`,
        sql`SELECT * FROM day_closings ORDER BY date`,
        sql`SELECT * FROM audit_log    ORDER BY created_at`,
        sql`SELECT * FROM no_sale_log  ORDER BY created_at`,
        sql`SELECT * FROM tables_layout`,
        sql`SELECT * FROM printers`,
      ])

      const backup = {
        meta: {
          version:     '2.1.0',
          exported_at: new Date().toISOString(),
          db:          process.env.DB_NAME || 'restaurant_pos_central',
          ...(outlet_id ? { outlet_id, outlet_name, scope: 'outlet' } : { scope: 'full' }),
        },
        settings, cashiers, categories, menu_items, customers,
        orders, order_items, shifts, expenses, day_closings,
        audit_log, no_sale_log, tables_layout, printers,
      }

      const suffix  = outlet_id ? `-outlet-${(outlet_name||outlet_id).replace(/[^a-z0-9]/gi,'-').toLowerCase()}` : ''
      const filename = `pos-backup${suffix}-${new Date().toISOString().slice(0, 10)}.json`
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(JSON.stringify(backup, null, 2))
    } catch (e) { serverError(res, e) }
  })

  // POST /downloads/restore — restore from JSON backup (danger: clears existing data)
  router.post('/restore', jwtAuth, async (req, res) => {
    const { backup, confirm } = req.body || {}
    if (confirm !== 'RESTORE') return res.status(400).json({ error: 'Send confirm:"RESTORE" to proceed' })
    if (!backup || !backup.meta) return res.status(400).json({ error: 'Invalid backup payload' })

    try {
      await sql.begin(async t => {
        // Clear in dependency order
        await t`DELETE FROM audit_log`
        await t`DELETE FROM no_sale_log`
        await t`DELETE FROM order_items`
        await t`DELETE FROM orders`
        await t`DELETE FROM expenses`
        await t`DELETE FROM shifts`
        await t`DELETE FROM day_closings`
        await t`DELETE FROM customers`
        await t`DELETE FROM menu_items`
        await t`DELETE FROM categories`
        await t`DELETE FROM printers`

        const ins = (tbl, rows) => rows.length ? t`INSERT INTO ${t(tbl)} ${t(rows)}` : Promise.resolve()

        await ins('settings',      backup.settings      || [])
        await ins('cashiers',      backup.cashiers      || [])
        await ins('categories',    backup.categories    || [])
        await ins('menu_items',    backup.menu_items    || [])
        await ins('customers',     backup.customers     || [])
        await ins('printers',      backup.printers      || [])
        await ins('tables_layout', backup.tables_layout || [])
        await ins('shifts',        backup.shifts        || [])
        await ins('expenses',      backup.expenses      || [])
        await ins('orders',        backup.orders        || [])
        await ins('order_items',   backup.order_items   || [])
        await ins('day_closings',  backup.day_closings  || [])
        await ins('audit_log',     backup.audit_log     || [])
        await ins('no_sale_log',   backup.no_sale_log   || [])
      })

      res.json({ ok: true, message: 'Restore complete' })
    } catch (e) { serverError(res, e) }
  })

  // GET /downloads/setup-package/:outlet_id — generate setup ZIP for an outlet
  function buildSetupGuideHtml(outlet, serverHost) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>POS Setup Guide - ${outlet.name}</title>
  <style>
    :root { --primary: #f97316; --bg: #f1f5f9; --card: #fff; --border: #e2e8f0; --text: #0f172a; --muted: #64748b; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    header { background: var(--card); padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { color: var(--primary); margin-bottom: 8px; }
    .outlet-info { background: var(--primary); color: white; padding: 12px 16px; border-radius: 8px; font-weight: 600; margin-top: 12px; }
    .steps { display: flex; flex-direction: column; gap: 16px; }
    .step { background: var(--card); padding: 20px; border-radius: 12px; border-left: 4px solid var(--primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .step-num { display: inline-block; background: var(--primary); color: white; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 700; margin-right: 12px; margin-bottom: 12px; }
    .step-title { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
    .step-content { color: var(--muted); line-height: 1.6; }
    code { background: var(--bg); padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace; }
    .code-block { background: var(--bg); padding: 12px; border-radius: 8px; border: 1px solid var(--border); overflow-x: auto; margin: 12px 0; }
    .code-block code { background: none; padding: 0; }
    pre { margin: 0; font-size: 13px; }
    .btn { display: inline-block; background: var(--primary); color: white; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; text-decoration: none; margin: 4px 4px 4px 0; border: none; }
    .btn:hover { opacity: 0.9; }
    .checkbox { margin-top: 12px; }
    .checkbox input { margin-right: 8px; cursor: pointer; }
    .checkbox label { cursor: pointer; }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📦 POS Terminal Setup Guide</h1>
      <p>Step-by-step instructions to set up your POS terminal</p>
      <div class="outlet-info">Outlet: ${outlet.name} (${outlet.outlet_code})</div>
    </header>

    <div class="steps">
      <div class="step">
        <span class="step-num">1</span>
        <div class="step-title">Install PostgreSQL 16</div>
        <div class="step-content">
          <p>Download and install PostgreSQL from the official website:</p>
          <p><a href="https://www.postgresql.org/download/windows/" target="_blank">Download PostgreSQL 16</a></p>
          <p style="margin-top: 12px; font-size: 13px; color: var(--muted);">
            ℹ️ When prompted during installation, remember the postgres superuser password you set. You'll need it in the next step.
          </p>
          <div class="checkbox"><input type="checkbox" id="step1"> <label for="step1">PostgreSQL installed</label></div>
        </div>
      </div>

      <div class="step">
        <span class="step-num">2</span>
        <div class="step-title">Initialize Database</div>
        <div class="step-content">
          <p>Run the database setup script to create the POS database and user:</p>
          <div class="code-block"><pre>psql -U postgres -f setup-database.sql</pre></div>
          <p style="margin-top: 12px; font-size: 13px;">When prompted, enter the postgres password from step 1.</p>
          <button class="btn" onclick="copyCode('setup-db')">📋 Copy</button>
          <div id="setup-db" style="display:none">psql -U postgres -f setup-database.sql</div>
          <p style="margin-top: 12px; color: var(--muted); font-size: 13px;">✅ You should see messages about creating user and database.</p>
          <div class="checkbox"><input type="checkbox" id="step2"> <label for="step2">Database initialized</label></div>
        </div>
      </div>

      <div class="step">
        <span class="step-num">3</span>
        <div class="step-title">Download POS Installer</div>
        <div class="step-content">
          <p>Download the latest POS terminal installer:</p>
          <p><a href="http://${serverHost}:3001/updates/Restaurant%20POS%20Setup%202.1.0.exe" target="_blank">📥 Download POS Setup 2.1.0.exe</a></p>
          <p style="margin-top: 12px; font-size: 13px; color: var(--muted);">File size: ~78 MB (may take a few minutes)</p>
          <div class="checkbox"><input type="checkbox" id="step3"> <label for="step3">Installer downloaded</label></div>
        </div>
      </div>

      <div class="step">
        <span class="step-num">4</span>
        <div class="step-title">Install POS Application</div>
        <div class="step-content">
          <p>Run the installer you downloaded in step 3:</p>
          <ol style="margin-left: 20px; color: var(--muted);">
            <li>Double-click <code>Restaurant POS Setup 2.1.0.exe</code></li>
            <li>Accept the license agreement</li>
            <li>Accept default installation folder</li>
            <li>Complete the installation wizard</li>
          </ol>
          <div class="checkbox"><input type="checkbox" id="step4"> <label for="step4">POS installed</label></div>
        </div>
      </div>

      <div class="step">
        <span class="step-num">5</span>
        <div class="step-title">Configure POS Connection</div>
        <div class="step-content">
          <p>Copy the <code>pos-config.json</code> file to the POS configuration directory:</p>
          <div class="code-block"><pre>%APPDATA%\\restaurant-pos\\pos-config.json</pre></div>
          <p style="margin-top: 12px; font-size: 13px; color: var(--muted);">
            📂 If the <code>restaurant-pos</code> folder doesn't exist, create it manually in <code>%APPDATA%</code> (usually <code>C:\\Users\\YourUsername\\AppData\\Roaming\\</code>)
          </p>
          <div class="checkbox"><input type="checkbox" id="step5"> <label for="step5">Config file copied</label></div>
        </div>
      </div>

      <div class="step">
        <span class="step-num">6</span>
        <div class="step-title">Launch POS & Create Database</div>
        <div class="step-content">
          <p>Launch the POS application from your Start menu or desktop shortcut:</p>
          <ol style="margin-left: 20px; color: var(--muted);">
            <li>Find and run "Restaurant POS"</li>
            <li>POS will automatically detect <code>pos-config.json</code></li>
            <li>It will connect to PostgreSQL and create all tables (first run takes ~10 seconds)</li>
            <li>You should see the PIN entry screen</li>
          </ol>
          <div class="checkbox"><input type="checkbox" id="step6"> <label for="step6">POS launched & ready</label></div>
        </div>
      </div>

      <div class="step">
        <span class="step-num">7</span>
        <div class="step-title">Login to POS</div>
        <div class="step-content">
          <p>Use your outlet PIN to log in:</p>
          <div class="code-block"><pre>PIN: Ask your manager or administrator for the outlet PIN</pre></div>
          <p style="margin-top: 12px; color: var(--muted); font-size: 13px;">
            ✅ You're now ready to start taking orders! Your POS is connected to the central PostgreSQL database and can be used immediately.
          </p>
          <div class="checkbox"><input type="checkbox" id="step7"> <label for="step7">Logged in successfully</label></div>
        </div>
      </div>
    </div>

    <div style="background: var(--card); padding: 20px; border-radius: 12px; margin-top: 24px; border: 1px solid var(--border);">
      <h3 style="margin-bottom: 12px;">❓ Troubleshooting</h3>
      <ul style="margin-left: 20px; color: var(--muted); line-height: 1.8;">
        <li><strong>PostgreSQL won't start:</strong> Make sure you remembered the postgres password from installation.</li>
        <li><strong>Database creation failed:</strong> Check that PostgreSQL service is running (Services app in Windows).</li>
        <li><strong>POS can't connect:</strong> Verify <code>pos-config.json</code> is in the correct folder and has the right permissions.</li>
        <li><strong>Need help?</strong> Contact your system administrator.</li>
      </ul>
    </div>
  </div>

  <script>
    function copyCode(id) {
      const text = document.getElementById(id).textContent;
      navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!');
      });
    }
  </script>
</body>
</html>`
  }

  router.get('/setup-package/:outlet_id', jwtAuth, async (req, res) => {
    try {
      const rid = req.user.brand_id
      const [outlet] = await sql`SELECT * FROM outlets WHERE id = ${req.params.outlet_id} AND brand_id = ${rid}`
      if (!outlet) return res.status(404).json({ error: 'Outlet not found' })

      const serverHost = req.get('X-Forwarded-For')?.split(',')[0].trim() || req.hostname || '127.0.0.1'
      const config = {
        serverIp: serverHost,
        dbHost: '127.0.0.1',
        dbPort: '5432',
        dbName: 'restaurant_pos_central',
        dbUser: 'pos_central_user',
        dbPass: 'pos_secure_2024!',
        dbSsl: 'false',
        outletCode: outlet.outlet_code,
        outletId: outlet.id,
        outletName: outlet.name,
        brandId: outlet.brand_id,
        machineId: `POS-${outlet.outlet_code}-01`,
        apiKey: 'pos-api-key-2026',
      }

      const safeName = outlet.name.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '-')
      const zipName = `POS-Setup-${safeName}-${outlet.outlet_code}.zip`

      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`)

      const archive = archiver('zip', { zlib: { level: 9 } })
      archive.pipe(res)

      // 1. pos-config.json
      archive.append(JSON.stringify(config, null, 2), { name: 'pos-config.json' })

      // 2. setup-database.sql
      const sqlPath = path.join(__dirname, '../../scripts/setup-local-pg.sql')
      if (fs.existsSync(sqlPath)) {
        archive.file(sqlPath, { name: 'setup-database.sql' })
      }

      // 3. SETUP-GUIDE.html
      const html = buildSetupGuideHtml(outlet, serverHost)
      archive.append(html, { name: 'SETUP-GUIDE.html' })

      await archive.finalize()
    } catch (e) { serverError(res, e) }
  })

  return router
}
