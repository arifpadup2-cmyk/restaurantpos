'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

function newId () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

const DEFAULT_PAYMENT_METHODS = [
  { name: 'Cash',                type: 'cash',    sort_order: 0 },
  { name: 'Credit / Debit Card', type: 'card',    sort_order: 1 },
  { name: 'e-Wallet',            type: 'ewallet', sort_order: 2 },
  { name: 'QR Payment',          type: 'qr',      sort_order: 3 },
  { name: 'Bank Transfer',       type: 'bank',    sort_order: 4 },
  { name: 'Voucher',             type: 'voucher', sort_order: 5 },
]

const DEFAULT_DELIVERY_PARTNERS = [
  { name: 'GrabFood',      commission_rate: 0 },
  { name: 'FoodPanda',     commission_rate: 0 },
  { name: 'Shopee Food',   commission_rate: 0 },
  { name: 'AirAsia Food',  commission_rate: 0 },
  { name: 'Lalamove',      commission_rate: 0 },
]

const DEFAULT_ORDER_TYPES = [
  { name: 'Dine In',    icon: 'dine',     sort_order: 0 },
  { name: 'Takeaway',   icon: 'takeaway', sort_order: 1 },
  { name: 'Delivery',   icon: 'delivery', sort_order: 2 },
  { name: 'Drive Thru', icon: 'drive',    sort_order: 3 },
]

const DEFAULT_DESIGNATIONS = [
  {
    name: 'Cashier', access_level: 1,
    permissions: { can_open_cash_drawer: true, can_manage_tables: true },
  },
  {
    name: 'Supervisor', access_level: 2,
    permissions: {
      can_open_cash_drawer: true, can_manage_tables: true,
      can_void_order: true, can_apply_discount: true, can_delete_order_item: true,
    },
  },
  {
    name: 'Manager', access_level: 3,
    permissions: {
      can_open_cash_drawer: true, can_manage_tables: true,
      can_void_order: true, can_apply_discount: true, can_delete_order_item: true,
      can_close_shift: true, can_view_reports: true,
      can_process_refund: true, can_override_price: true, can_access_cashier_report: true,
    },
  },
]

module.exports = function configRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  // ── BRAND ──────────────────────────────────────────────────────────────────
  router.get('/brand', async (req, res) => {
    const rid = req.user.restaurant_id
    if (!rid) return res.json({ brand: {} })
    try {
      const [r] = await sql`
        SELECT name, owner_name, business_type, country, logo_url FROM restaurants WHERE id = ${rid}`
      res.json({ brand: r || {} })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.put('/brand', async (req, res) => {
    const { name, owner_name, business_type, country, logo_url } = req.body || {}
    const rid = req.user.restaurant_id
    if (!rid) return res.status(400).json({ error: 'No restaurant' })
    try {
      await sql`
        UPDATE restaurants SET
          name          = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          brand_name    = COALESCE(NULLIF(${(name || '').trim()}, ''), brand_name),
          owner_name    = COALESCE(NULLIF(${(owner_name || '').trim()}, ''), owner_name),
          business_type = COALESCE(NULLIF(${business_type || ''}, ''), business_type),
          country       = COALESCE(NULLIF(${country || ''}, ''), country),
          logo_url      = COALESCE(NULLIF(${logo_url || ''}, ''), logo_url)
        WHERE id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── OUTLET ─────────────────────────────────────────────────────────────────
  const OUTLET_KEYS = [
    'branch_name', 'outlet_phone', 'outlet_email', 'address',
    'opening_time', 'closing_time', 'currency', 'tax_rate', 'country',
  ]

  router.get('/outlet', async (req, res) => {
    const rid = req.user?.restaurant_id || ''
    try {
      const rows = await sql`SELECT key, value FROM settings WHERE key = ANY(${OUTLET_KEYS}) AND restaurant_id = ${rid}`
      res.json({ outlet: Object.fromEntries(rows.map(r => [r.key, r.value])) })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.put('/outlet', async (req, res) => {
    const rid  = req.user?.restaurant_id || ''
    const body = req.body || {}
    try {
      for (const key of OUTLET_KEYS) {
        if (body[key] === undefined) continue
        await sql`
          INSERT INTO settings (restaurant_id, key, value) VALUES (${rid}, ${key}, ${String(body[key])})
          ON CONFLICT (restaurant_id, key) DO UPDATE SET value = EXCLUDED.value`
      }
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── TAX GROUPS ─────────────────────────────────────────────────────────────
  router.get('/tax-groups', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      const rows = await sql`SELECT * FROM tax_groups WHERE restaurant_id = ${rid} ORDER BY created_at`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/tax-groups', async (req, res) => {
    const { name, rate, is_default } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      if (is_default) await sql`UPDATE tax_groups SET is_default = false WHERE restaurant_id = ${rid}`
      const [row] = await sql`
        INSERT INTO tax_groups (id, restaurant_id, name, rate, is_default, created_at)
        VALUES (${newId()}, ${rid}, ${name.trim()}, ${parseFloat(rate) || 0}, ${!!is_default}, ${Date.now()})
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/tax-groups/:id', async (req, res) => {
    const { name, rate, is_default } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      if (is_default) await sql`UPDATE tax_groups SET is_default = false WHERE restaurant_id = ${rid}`
      const [row] = await sql`
        UPDATE tax_groups SET
          name       = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          rate       = COALESCE(${rate !== undefined ? parseFloat(rate) : null}, rate),
          is_default = COALESCE(${is_default !== undefined ? !!is_default : null}, is_default)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/tax-groups/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      await sql`DELETE FROM tax_groups WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── PAYMENT METHODS ────────────────────────────────────────────────────────
  router.get('/payment-methods', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      let rows = await sql`SELECT * FROM payment_methods WHERE restaurant_id = ${rid} ORDER BY sort_order, name`
      if (!rows.length) {
        for (const d of DEFAULT_PAYMENT_METHODS) {
          await sql`INSERT INTO payment_methods (id, restaurant_id, name, type, enabled, sort_order)
            VALUES (${newId()}, ${rid}, ${d.name}, ${d.type}, true, ${d.sort_order})`
        }
        rows = await sql`SELECT * FROM payment_methods WHERE restaurant_id = ${rid} ORDER BY sort_order, name`
      }
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/payment-methods', async (req, res) => {
    const { name, type } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO payment_methods (id, restaurant_id, name, type, enabled, sort_order)
        VALUES (${newId()}, ${rid}, ${name.trim()}, ${type || 'other'}, true,
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM payment_methods WHERE restaurant_id = ${rid}))
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/payment-methods/:id', async (req, res) => {
    const { name, enabled } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE payment_methods SET
          name    = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          enabled = COALESCE(${enabled !== undefined ? !!enabled : null}, enabled)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/payment-methods/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      await sql`DELETE FROM payment_methods WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── DELIVERY PARTNERS ──────────────────────────────────────────────────────
  router.get('/delivery-partners', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      let rows = await sql`SELECT * FROM delivery_partners WHERE restaurant_id = ${rid} ORDER BY name`
      if (!rows.length) {
        for (const d of DEFAULT_DELIVERY_PARTNERS) {
          await sql`INSERT INTO delivery_partners (id, restaurant_id, name, enabled, commission_rate)
            VALUES (${newId()}, ${rid}, ${d.name}, false, 0)`
        }
        rows = await sql`SELECT * FROM delivery_partners WHERE restaurant_id = ${rid} ORDER BY name`
      }
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/delivery-partners', async (req, res) => {
    const { name, commission_rate } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO delivery_partners (id, restaurant_id, name, enabled, commission_rate)
        VALUES (${newId()}, ${rid}, ${name.trim()}, true, ${parseFloat(commission_rate) || 0})
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/delivery-partners/:id', async (req, res) => {
    const { name, enabled, commission_rate } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE delivery_partners SET
          name            = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          enabled         = COALESCE(${enabled !== undefined ? !!enabled : null}, enabled),
          commission_rate = COALESCE(${commission_rate !== undefined ? parseFloat(commission_rate) : null}, commission_rate)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/delivery-partners/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      await sql`DELETE FROM delivery_partners WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── ORDER TYPES ────────────────────────────────────────────────────────────
  router.get('/order-types', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      let rows = await sql`SELECT * FROM order_types WHERE restaurant_id = ${rid} ORDER BY sort_order, name`
      if (!rows.length) {
        for (const d of DEFAULT_ORDER_TYPES) {
          await sql`INSERT INTO order_types (id, restaurant_id, name, enabled, icon, sort_order)
            VALUES (${newId()}, ${rid}, ${d.name}, true, ${d.icon}, ${d.sort_order})`
        }
        rows = await sql`SELECT * FROM order_types WHERE restaurant_id = ${rid} ORDER BY sort_order, name`
      }
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/order-types', async (req, res) => {
    const { name, icon } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO order_types (id, restaurant_id, name, enabled, icon, sort_order)
        VALUES (${newId()}, ${rid}, ${name.trim()}, true, ${icon || ''},
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM order_types WHERE restaurant_id = ${rid}))
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/order-types/:id', async (req, res) => {
    const { name, enabled } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE order_types SET
          name    = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          enabled = COALESCE(${enabled !== undefined ? !!enabled : null}, enabled)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/order-types/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      await sql`DELETE FROM order_types WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── KITCHENS ───────────────────────────────────────────────────────────────
  router.get('/kitchens', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      const rows = await sql`SELECT * FROM kitchens WHERE restaurant_id = ${rid} ORDER BY sort_order, name`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/kitchens', async (req, res) => {
    const { name, color } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO kitchens (id, restaurant_id, name, color, enabled, sort_order)
        VALUES (${newId()}, ${rid}, ${name.trim()}, ${color || '#6366f1'}, true,
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM kitchens WHERE restaurant_id = ${rid}))
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/kitchens/:id', async (req, res) => {
    const { name, color, enabled } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE kitchens SET
          name    = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          color   = COALESCE(NULLIF(${color || ''}, ''), color),
          enabled = COALESCE(${enabled !== undefined ? !!enabled : null}, enabled)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/kitchens/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      await sql`DELETE FROM kitchens WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── DESIGNATIONS ───────────────────────────────────────────────────────────
  router.get('/designations', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      let rows = await sql`SELECT * FROM designations WHERE restaurant_id = ${rid} ORDER BY access_level, name`
      if (!rows.length) {
        for (const d of DEFAULT_DESIGNATIONS) {
          await sql`INSERT INTO designations (id, restaurant_id, name, access_level, permissions)
            VALUES (${newId()}, ${rid}, ${d.name}, ${d.access_level}, ${sql.json(d.permissions)})`
        }
        rows = await sql`SELECT * FROM designations WHERE restaurant_id = ${rid} ORDER BY access_level, name`
      }
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/designations', async (req, res) => {
    const { name, access_level, permissions } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO designations (id, restaurant_id, name, access_level, permissions)
        VALUES (${newId()}, ${rid}, ${name.trim()}, ${parseInt(access_level) || 1}, ${sql.json(permissions || {})})
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/designations/:id', async (req, res) => {
    const { name, access_level, permissions } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const updates = {}
      if (name)             updates.name         = name.trim()
      if (access_level)     updates.access_level = parseInt(access_level)
      if (permissions)      updates.permissions  = permissions
      const [row] = await sql`
        UPDATE designations SET
          name         = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          access_level = COALESCE(${access_level !== undefined ? parseInt(access_level) : null}, access_level),
          permissions  = COALESCE(${permissions !== undefined ? sql.json(permissions) : null}, permissions)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/designations/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      await sql`DELETE FROM designations WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
