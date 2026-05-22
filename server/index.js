'use strict'

require('dotenv').config()

const express    = require('express')
const cors       = require('cors')
const postgres   = require('postgres')
const path       = require('path')
const fs         = require('fs')
const http       = require('http')
const { Server } = require('socket.io')

const authRouter      = require('./routes/auth')
const menuRouter      = require('./routes/menu')
const ordersRouter    = require('./routes/orders')
const reportsRouter   = require('./routes/reports')
const staffRouter     = require('./routes/staff')
const settingsRouter  = require('./routes/settings-bo')
const tablesRouter    = require('./routes/tables')
const kitchenRouter   = require('./routes/kitchen')
const waiterRouter    = require('./routes/waiter')
const printersRouter  = require('./routes/printers')
const auditRouter     = require('./routes/audit')
const customersRouter = require('./routes/customers')
const seedRouter       = require('./routes/seed')
const downloadsRouter  = require('./routes/downloads')
const setupRouter      = require('./routes/setup')
const signupRouter     = require('./routes/signup')
const adminAuthRouter  = require('./routes/admin-auth')

const PORT     = parseInt(process.env.PORT || '3001', 10)
const API_KEY  = process.env.API_KEY || ''
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname)

// ── Database ──────────────────────────────────────────────────────────────────
// Railway sets DATABASE_URL automatically; individual DB_* vars used otherwise.

const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, {
      ssl:             { rejectUnauthorized: false },
      max:             20,
      idle_timeout:    30,
      connect_timeout: 10,
      onnotice:        () => {},
    })
  : postgres({
      host:            process.env.DB_HOST     || '127.0.0.1',
      port:            parseInt(process.env.DB_PORT || '5432', 10),
      database:        process.env.DB_NAME     || 'restaurant_pos_central',
      user:            process.env.DB_USER     || 'pos_central_user',
      password:        process.env.DB_PASS     || '',
      max:             20,
      idle_timeout:    30,
      connect_timeout: 10,
      onnotice:        () => {},
    })

// ── Migrations on startup ─────────────────────────────────────────────────────

const SHARED_MIGRATIONS  = path.join(__dirname, '..', 'pos', 'migrations')
const CENTRAL_MIGRATIONS = path.join(__dirname, 'migrations')

async function runMigrations () {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`

  const appliedRows = await sql`SELECT version FROM schema_migrations`
  const done = new Set(appliedRows.map(r => r.version))

  const files = []
  for (const dir of [SHARED_MIGRATIONS, CENTRAL_MIGRATIONS]) {
    if (!fs.existsSync(dir)) continue
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql') && !f.includes('sync_queue'))
      .sort()
      .forEach(f => files.push({ f, dir }))
  }

  for (const { f, dir } of files) {
    const version = f.replace('.sql', '')
    if (done.has(version)) continue
    const migSql = fs.readFileSync(path.join(dir, f), 'utf8')
    await sql.begin(async t => {
      await t.unsafe(migSql)
      await t`INSERT INTO schema_migrations (version) VALUES (${version})`
    })
    console.log(`  ✓ migration applied: ${f}`)
  }
}

// ── Express + Socket.io ───────────────────────────────────────────────────────

const app        = express()
const httpServer = http.createServer(app)
const io         = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// Expose io to route handlers via req.io
app.use((req, _res, next) => { req.io = io; next() })

// Static: public signup/onboarding pages (served at root)
const publicPath = path.join(__dirname, 'public')
if (fs.existsSync(publicPath)) app.use(express.static(publicPath))

// Static: provider admin panel
const adminPath = path.join(__dirname, 'admin')
if (fs.existsSync(adminPath)) app.use('/admin', express.static(adminPath))

// Static: backoffice, waiter-app, kds
const boPath      = path.join(__dirname, '..', 'backoffice')
const waiterPath  = path.join(__dirname, '..', 'waiter-app')
const kdsPath     = path.join(__dirname, '..', 'kds')
if (fs.existsSync(boPath))     app.use('/backoffice',  express.static(boPath))
if (fs.existsSync(waiterPath)) app.use('/waiter-app',  express.static(waiterPath))
if (fs.existsSync(kdsPath))    app.use('/kds',         express.static(kdsPath))

// Auto-update files for electron-updater
const updatesPath = path.join(DATA_DIR, 'updates')
if (!fs.existsSync(updatesPath)) fs.mkdirSync(updatesPath, { recursive: true })
app.use('/updates', express.static(updatesPath))

// ── Auth middleware ───────────────────────────────────────────────────────────

function auth (req, res, next) {
  if (!API_KEY) return next()
  const key = req.headers['x-api-key']
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// ── Socket.io ─────────────────────────────────────────────────────────────────

io.on('connection', socket => {
  const area = socket.handshake.query.area || 'general'
  socket.join(area)
  socket.on('disconnect', () => {})
})

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  try {
    await sql`SELECT 1`
    res.json({ ok: true, version: '2.1.0', db: 'connected', ts: Date.now() })
  } catch (e) {
    res.status(503).json({ ok: false, db: 'disconnected', error: e.message })
  }
})

// Internal notify — called by Electron POS after direct DB writes
// so Socket.io can broadcast to KDS / waiter apps.
app.post('/internal/notify', auth, (req, res) => {
  const { event, payload } = req.body || {}
  if (event && payload) io.emit(event, payload)
  res.json({ ok: true })
})

// POS sync endpoints (Electron terminals → central DB)
app.get('/sync/menu', auth, async (_req, res) => {
  try {
    const categories = await sql`
      SELECT id, name, sort_order, color, active, synced_at
      FROM categories ORDER BY sort_order, name`
    const items = await sql`
      SELECT id, category_id, name, price, description, active, synced_at
      FROM menu_items ORDER BY name`
    res.json({ categories, items })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/sync/cashiers', auth, async (_req, res) => {
  try {
    const cashiers = await sql`
      SELECT id, name, pin, role, active, created_at
      FROM cashiers WHERE active = 1 ORDER BY name`
    res.json({ cashiers })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/sync/orders', auth, async (req, res) => {
  const { records } = req.body || {}
  if (!Array.isArray(records) || records.length === 0)
    return res.json({ ok: true, synced: 0 })
  try {
    let synced = 0
    for (const o of records) {
      const items = o.items || []
      delete o.items
      await sql.begin(async t => {
        await t`
          INSERT INTO orders ${sql(sanitizeOrder(o))}
          ON CONFLICT (id) DO UPDATE SET
            status           = EXCLUDED.status,
            total            = EXCLUDED.total,
            payment_method   = EXCLUDED.payment_method,
            payment_received = EXCLUDED.payment_received,
            billed_at        = EXCLUDED.billed_at,
            synced           = 1`
        for (const item of items) {
          await t`
            INSERT INTO order_items ${sql(sanitizeOrderItem(item))}
            ON CONFLICT (id) DO NOTHING`
        }
      })
      synced++
    }
    res.json({ ok: true, synced })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/sync/expenses', auth, async (req, res) => {
  const { records } = req.body || {}
  if (!Array.isArray(records) || records.length === 0)
    return res.json({ ok: true, synced: 0 })
  try {
    for (const e of records)
      await sql`INSERT INTO expenses ${sql(sanitizeExpense(e))} ON CONFLICT (id) DO NOTHING`
    res.json({ ok: true, synced: records.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/sync/shifts', auth, async (req, res) => {
  const { records } = req.body || {}
  if (!Array.isArray(records) || records.length === 0)
    return res.json({ ok: true, synced: 0 })
  try {
    for (const s of records)
      await sql`
        INSERT INTO shifts ${sql(sanitizeShift(s))}
        ON CONFLICT (id) DO UPDATE SET
          closing_cash = EXCLUDED.closing_cash,
          status       = EXCLUDED.status,
          closed_at    = EXCLUDED.closed_at,
          synced       = 1`
    res.json({ ok: true, synced: records.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/sync/day_closings', auth, async (req, res) => {
  const { records } = req.body || {}
  if (!Array.isArray(records) || records.length === 0)
    return res.json({ ok: true, synced: 0 })
  try {
    for (const d of records)
      await sql`INSERT INTO day_closings ${sql(sanitizeDayClosing(d))} ON CONFLICT (id) DO NOTHING`
    res.json({ ok: true, synced: records.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Sanitizers ────────────────────────────────────────────────────────────────

const ORDER_COLS = [
  'id','order_number','order_type','table_id','table_name','customer_name',
  'customer_phone','customer_address','status','subtotal','tax_rate','tax_amount',
  'discount_type','discount_value','discount_amount','total','payment_method',
  'payment_received','change_amount','notes','cashier_id','cashier_name',
  'shift_id','terminal_id','created_at','updated_at','billed_at','synced',
  'void_reason','voided_by','approved_by','service_charge_rate','service_charge_amount','customer_id',
]
const ITEM_COLS    = ['id','order_id','item_id','item_name','category_name','quantity','unit_price','total_price','notes','void_reason','voided_by','voided_at','cancelled']
const EXPENSE_COLS = ['id','category','description','amount','cashier_id','cashier_name','shift_id','terminal_id','created_at','synced']
const SHIFT_COLS   = ['id','cashier_id','cashier_name','opening_cash','closing_cash','notes','status','terminal_id','opened_at','closed_at','synced']
const DAY_COLS     = ['id','date','total_orders','total_sales','cash_sales','card_sales','online_payment_sales','total_expenses','net_sales','dine_in_count','takeaway_count','delivery_count','online_count','closed_by','closed_at','notes','synced']

function pick (obj, cols) {
  const result = {}
  for (const col of cols) if (obj[col] !== undefined) result[col] = obj[col]
  return result
}

function sanitizeOrder      (o) { return pick(o, ORDER_COLS) }
function sanitizeOrderItem  (o) { return pick(o, ITEM_COLS) }
function sanitizeExpense    (o) { return pick(o, EXPENSE_COLS) }
function sanitizeShift      (o) { return pick(o, SHIFT_COLS) }
function sanitizeDayClosing (o) { return pick(o, DAY_COLS) }

// Export sanitizers + sql for route modules
module.exports = { sql, io, sanitizeOrder, sanitizeOrderItem, sanitizeExpense, sanitizeShift, sanitizeDayClosing, pick }

// ── Startup ───────────────────────────────────────────────────────────────────

async function start () {
  console.log('Restaurant POS — API Server starting...\n')

  try {
    await sql`SELECT 1`
    console.log(`  ✓ Connected to central DB: ${process.env.DB_NAME || 'restaurant_pos_central'}`)
  } catch (e) {
    console.error(`  ✗ DB connection failed: ${e.message}`)
    process.exit(1)
  }

  await runMigrations()
  await seedAdminUser()

  // Wire SQL into JWT middleware so deleted users are rejected immediately
  require('./middleware/jwtAuth').initJwtAuth(sql)

  app.use('/auth',      authRouter(sql))
  app.use('/menu',      menuRouter(sql))
  app.use('/orders',    ordersRouter(sql))
  app.use('/reports',   reportsRouter(sql))
  app.use('/staff',     staffRouter(sql))
  app.use('/settings',  settingsRouter(sql))
  app.use('/tables',    tablesRouter(sql))
  app.use('/kitchen',   kitchenRouter(sql))
  app.use('/waiter',    waiterRouter(sql))
  app.use('/printers',  printersRouter(sql))
  app.use('/audit',     auth, auditRouter(sql))
  app.use('/customers', auth, customersRouter(sql))
  app.use('/seed',           seedRouter(sql))
  app.use('/downloads',      downloadsRouter(sql))
  app.use('/setup',          setupRouter(sql))
  app.use('/api',            signupRouter(sql))
  app.use('/admin-auth',     adminAuthRouter(sql))

  // Onboarding SPA route — serve onboarding.html for /onboarding/:id
  app.get('/onboarding/:id', (_req, res) => {
    const p = path.join(__dirname, 'public', 'onboarding.html')
    if (fs.existsSync(p)) res.sendFile(p)
    else res.status(404).send('Onboarding page not found')
  })
  // Signup route alias
  app.get('/signup', (_req, res) => {
    const p = path.join(__dirname, 'public', 'signup.html')
    if (fs.existsSync(p)) res.sendFile(p)
    else res.status(404).send('Signup page not found')
  })

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ✓ API server listening on http://0.0.0.0:${PORT}`)
    console.log(`  ✓ Socket.io enabled`)
    console.log(`  ✓ API key auth: ${API_KEY ? 'enabled' : 'DISABLED (dev mode)'}`)
    console.log(`  ✓ Environment: ${process.env.NODE_ENV || 'development'}\n`)
  })

  // Auto-backup every 6 hours
  startAutoBackup()

  // Trial expiry check — daily
  setTimeout(checkTrialExpiry, 30 * 1000)
  setInterval(checkTrialExpiry, 24 * 60 * 60 * 1000)
}

async function runBackup () {
  const backupsDir = path.join(DATA_DIR, 'backups')
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })

  try {
    const tables = await Promise.all([
      sql`SELECT * FROM settings`,
      sql`SELECT * FROM cashiers`,
      sql`SELECT * FROM categories`,
      sql`SELECT * FROM menu_items`,
      sql`SELECT * FROM customers`,
      sql`SELECT * FROM orders       ORDER BY created_at`,
      sql`SELECT * FROM order_items`,
      sql`SELECT * FROM shifts       ORDER BY opened_at`,
      sql`SELECT * FROM expenses     ORDER BY created_at`,
      sql`SELECT * FROM day_closings ORDER BY date`,
      sql`SELECT * FROM audit_log    ORDER BY created_at`,
      sql`SELECT * FROM no_sale_log  ORDER BY created_at`,
      sql`SELECT * FROM tables_layout`,
      sql`SELECT * FROM printers`,
    ])
    const [settings, cashiers, categories, menu_items, customers, orders, order_items,
      shifts, expenses, day_closings, audit_log, no_sale_log, tables_layout, printers] = tables

    const backup = {
      meta: { version: '2.0.0', exported_at: new Date().toISOString(), db: process.env.DB_NAME },
      settings, cashiers, categories, menu_items, customers, orders, order_items,
      shifts, expenses, day_closings, audit_log, no_sale_log, tables_layout, printers,
    }

    const filename  = `backup-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`
    const filepath  = path.join(backupsDir, filename)
    const content   = JSON.stringify(backup)
    fs.writeFileSync(filepath, content)

    // Log to DB
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    await sql`INSERT INTO backup_log (id, filename, size_bytes) VALUES (${id}, ${filename}, ${content.length})
              ON CONFLICT DO NOTHING`

    // Prune backups older than 14 days
    const cutoff = Date.now() - 14 * 86400000
    fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .forEach(f => {
        const fPath = path.join(backupsDir, f)
        if (fs.statSync(fPath).mtimeMs < cutoff) fs.unlinkSync(fPath)
      })

    console.log(`  ✓ Auto-backup: ${filename} (${(content.length / 1024).toFixed(0)} KB)`)
  } catch (e) {
    console.error(`  ✗ Auto-backup failed: ${e.message}`)
  }
}

function startAutoBackup () {
  const SIX_HOURS = 6 * 60 * 60 * 1000
  // First backup 1 min after startup
  setTimeout(() => {
    runBackup()
    setInterval(runBackup, SIX_HOURS)
  }, 60 * 1000)
  console.log('  ✓ Auto-backup scheduled (every 6h, keeps 14 days)')
}

async function seedAdminUser () {
  try {
    const bcrypt   = require('bcryptjs')
    const ADMIN_UN = process.env.ADMIN_USERNAME || 'arifpadup'
    const ADMIN_PW = process.env.ADMIN_PASSWORD || 'Bappan_kunhi@4'
    const ADMIN_NM = process.env.ADMIN_NAME     || 'Mohammed Arif'

    const [existing] = await sql`SELECT id FROM admin_users WHERE username = ${ADMIN_UN}`
    if (existing) return // already seeded

    const id   = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const hash = await bcrypt.hash(ADMIN_PW, 10)
    await sql`INSERT INTO admin_users (id, username, password, name, role)
              VALUES (${id}, ${ADMIN_UN}, ${hash}, ${ADMIN_NM}, 'superadmin')`
    console.log(`  ✓ Admin account created: ${ADMIN_UN}`)
  } catch (e) {
    console.error(`  ✗ Admin seed failed: ${e.message}`)
  }
}

async function checkTrialExpiry () {
  try {
    // Mark expired trials as expired
    const expired = await sql`
      UPDATE restaurants
      SET status = 'expired'
      WHERE status = 'trial'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at < now()
      RETURNING id, name`
    if (expired.length > 0)
      console.log(`  ⚠ Trial expired: ${expired.map(r => `${r.name} (${r.id})`).join(', ')}`)

    // Log upcoming expirations (< 3 days)
    const soonExpiring = await sql`
      SELECT id, name, trial_ends_at FROM restaurants
      WHERE status = 'trial'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at < now() + interval '3 days'
        AND trial_ends_at > now()
      ORDER BY trial_ends_at`
    if (soonExpiring.length > 0)
      console.log(`  ⚠ Trials expiring soon: ${soonExpiring.map(r => r.name).join(', ')}`)
  } catch (e) {
    console.error('Trial expiry check failed:', e.message)
  }
}

process.on('SIGTERM', async () => { await sql.end({ timeout: 5 }); process.exit(0) })
process.on('SIGINT',  async () => { await sql.end({ timeout: 5 }); process.exit(0) })

start()
