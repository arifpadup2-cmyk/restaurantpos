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
    'owner_phone', 'business_type', 'country',
    'address', 'opening_time', 'closing_time',
    'table_count', 'outlet_phone', 'outlet_email',
  ]

  // GET /settings — returns all public settings
  router.get('/', async (req, res) => {
    const rid = req.user?.brand_id || ''
    try {
      const rows = await sql`SELECT key, value FROM settings WHERE key = ANY(${KEYS}) AND brand_id = ${rid}`
      const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))
      if (req.user?.brand_id) {
        const [b] = await sql`SELECT setup_done FROM brands WHERE id = ${req.user.brand_id}`
        settings.setup_done = b?.setup_done ?? (settings.setup_done === 'true' || settings.setup_done === true)
      } else {
        settings.setup_done = true
      }
      res.json({ settings })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT /settings — upsert restaurant settings
  router.put('/', async (req, res) => {
    const rid  = req.user?.brand_id || ''
    const body = req.body || {}
    try {
      for (const key of KEYS) {
        if (body[key] === undefined) continue
        await sql`
          INSERT INTO settings (brand_id, key, value) VALUES (${rid}, ${key}, ${String(body[key])})
          ON CONFLICT (brand_id, key) DO UPDATE SET value = EXCLUDED.value`
      }
      if (req.user?.brand_id) {
        const name          = (body.restaurant_name || '').trim() || null
        const owner         = (body.owner_name || '').trim() || null
        const business_type = (body.business_type || '').trim() || null
        const country       = (body.country || '').trim() || null
        const setupDone     = body.setup_done ? true : undefined
        if (name || owner || business_type || country || setupDone !== undefined) {
          await sql`
            UPDATE brands
            SET name          = COALESCE(${name}, name),
                owner_name    = COALESCE(${owner}, owner_name),
                business_type = COALESCE(${business_type}, business_type),
                country       = COALESCE(${country}, country),
                setup_done    = COALESCE(${setupDone ?? null}::boolean, setup_done)
            WHERE id = ${req.user.brand_id}`
        }
      }
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
