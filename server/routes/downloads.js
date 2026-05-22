'use strict'

const express  = require('express')
const fs       = require('fs')
const path     = require('path')
const { jwtAuth } = require('../middleware/jwtAuth')

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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // GET /downloads/backup — full JSON export of all data (for disaster recovery)
  router.get('/backup', jwtAuth, async (req, res) => {
    try {
      const [
        settings, cashiers, categories, menu_items, customers,
        orders, order_items, shifts, expenses, day_closings,
        audit_log, no_sale_log, tables_layout, printers,
      ] = await Promise.all([
        sql`SELECT * FROM settings WHERE restaurant_id = ${req.user.restaurant_id || ''}`,
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

      const backup = {
        meta: {
          version:     '2.0.0',
          exported_at: new Date().toISOString(),
          db:          process.env.DB_NAME || 'restaurant_pos_central',
        },
        settings, cashiers, categories, menu_items, customers,
        orders, order_items, shifts, expenses, day_closings,
        audit_log, no_sale_log, tables_layout, printers,
      }

      const filename = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(JSON.stringify(backup, null, 2))
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
