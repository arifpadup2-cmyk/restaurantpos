'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function settingsRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  const KEYS = [
    'restaurant_name', 'currency', 'tax_rate', 'receipt_footer',
    'branch_name', 'service_charge_rate', 'service_charge_label',
    'mgr_discount_threshold', 'require_void_reason', 'cash_variance_alert_pct',
    'kot_stay_seconds',
  ]

  // GET /settings — returns all public settings
  router.get('/', async (_req, res) => {
    try {
      const rows = await sql`SELECT key, value FROM settings WHERE key = ANY(${KEYS})`
      const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))
      res.json({ settings })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT /settings — upsert restaurant settings
  router.put('/', async (req, res) => {
    const body = req.body || {}
    try {
      for (const key of KEYS) {
        if (body[key] === undefined) continue
        await sql`
          INSERT INTO settings (key, value) VALUES (${key}, ${String(body[key])})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
      }
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
