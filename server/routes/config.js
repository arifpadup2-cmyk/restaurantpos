'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

function newId () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function outletId () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
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
  { name: 'Dine In',        icon: 'dine',     sort_order: 0 },
  { name: 'Takeaway',       icon: 'takeaway', sort_order: 1 },
  { name: 'Delivery',       icon: 'delivery', sort_order: 2 },
  { name: 'Drive Thru',     icon: 'drive',    sort_order: 3 },
  { name: 'Vehicle Order',  icon: 'vehicle',  sort_order: 4 },
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

  // ── BRANDS (list, multi-brand per owner) ────────────────────────────────────
  router.get('/brands', async (req, res) => {
    const rid = req.user.restaurant_id
    if (!rid) return res.json({ rows: [] })
    try {
      const rows = await sql`SELECT * FROM brands WHERE restaurant_id = ${rid} ORDER BY created_at`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/brands', async (req, res) => {
    const { name, logo_url, business_type, country, owner_name } = req.body || {}
    const rid = req.user.restaurant_id
    if (!rid) return res.status(400).json({ error: 'No restaurant account linked to this user.' })
    if (!name?.trim()) return res.status(400).json({ error: 'Brand name is required' })
    try {
      const [row] = await sql`
        INSERT INTO brands (id, restaurant_id, name, logo_url, business_type, country, owner_name, created_at)
        VALUES (${newId()}, ${rid}, ${name.trim()}, ${logo_url||null}, ${business_type||null}, ${country||'MY'}, ${(owner_name||'').trim()||null}, ${Date.now()})
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/brands/:id', async (req, res) => {
    const { name, logo_url, business_type, country, owner_name } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE brands SET
          name          = COALESCE(NULLIF(${(name||'').trim()}, ''), name),
          logo_url      = COALESCE(NULLIF(${logo_url||''}, ''), logo_url),
          business_type = COALESCE(NULLIF(${business_type||''}, ''), business_type),
          country       = COALESCE(NULLIF(${country||''}, ''), country),
          owner_name    = COALESCE(NULLIF(${(owner_name||'').trim()}, ''), owner_name)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'Brand not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/brands/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      let linked = 0
      try { const [c] = await sql`SELECT COUNT(*)::int AS n FROM outlets WHERE brand_id = ${req.params.id}`; linked = c?.n || 0 } catch (_) {}
      if (linked > 0) return res.status(409).json({ error: 'This brand has outlets linked to it. Remove the outlets first, then delete the brand.' })
      await sql`DELETE FROM brands WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── MARKETS ────────────────────────────────────────────────────────────────
  router.get('/markets', async (req, res) => {
    const rid = req.user.restaurant_id
    if (!rid) return res.json({ rows: [] })
    try {
      const rows = await sql`
        SELECT m.*, b.name AS brand_name
        FROM markets m
        LEFT JOIN brands b ON b.id = m.brand_id
        WHERE m.restaurant_id = ${rid}
        ORDER BY m.created_at`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/markets', async (req, res) => {
    const { name, brand_id, country, currency_code, currency_symbol } = req.body || {}
    const rid = req.user.restaurant_id
    if (!rid) return res.status(400).json({ error: 'No restaurant account linked.' })
    if (!name?.trim()) return res.status(400).json({ error: 'Market name is required' })
    if (!brand_id) return res.status(400).json({ error: 'Brand is required' })
    try {
      const [row] = await sql`
        INSERT INTO markets (id, restaurant_id, brand_id, name, country, currency_code, currency_symbol, created_at)
        VALUES (${newId()}, ${rid}, ${brand_id}, ${name.trim()},
                ${country||null}, ${currency_code||'USD'}, ${currency_symbol||'$'}, ${Date.now()})
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/markets/:id', async (req, res) => {
    const { name, brand_id, country, currency_code, currency_symbol } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE markets SET
          name            = COALESCE(NULLIF(${(name||'').trim()}, ''), name),
          brand_id        = ${brand_id !== undefined ? (brand_id || null) : sql`brand_id`},
          country         = COALESCE(NULLIF(${country||''}, ''), country),
          currency_code   = COALESCE(NULLIF(${currency_code||''}, ''), currency_code),
          currency_symbol = COALESCE(NULLIF(${currency_symbol||''}, ''), currency_symbol)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'Market not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/markets/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      let linked = 0
      try { const [c] = await sql`SELECT COUNT(*)::int AS n FROM outlets WHERE market_id = ${req.params.id}`; linked = c?.n || 0 } catch (_) {}
      if (linked > 0) return res.status(409).json({ error: 'This market has outlets linked. Remove the outlets first.' })
      await sql`DELETE FROM markets WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── OUTLETS (list, multi-outlet per owner) ────────────────────────────────
  router.get('/outlets', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      const rows = await sql`
        SELECT o.*, b.name AS brand_name, b.logo_url AS brand_logo,
               m.name AS market_name, m.country AS market_country,
               m.currency_code AS market_currency_code, m.currency_symbol AS market_currency_symbol
        FROM outlets o
        LEFT JOIN brands b ON b.id = o.brand_id
        LEFT JOIN markets m ON m.id = o.market_id
        WHERE o.restaurant_id = ${rid}
        ORDER BY o.created_at`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/outlets', async (req, res) => {
    const { name, brand_id, market_id, phone, email, address, opening_time, closing_time, currency, country, currency_code, currency_symbol } = req.body || {}
    const rid = req.user.restaurant_id
    if (!rid) return res.status(400).json({ error: 'No restaurant account linked to this user.' })
    if (!name?.trim()) return res.status(400).json({ error: 'Outlet name is required' })
    if (!market_id) return res.status(400).json({ error: 'Market is required for every outlet.' })
    try {
      const mkt = market_id ? (await sql`SELECT * FROM markets WHERE id = ${market_id} AND restaurant_id = ${rid}`)[0] : null
      const [row] = await sql`
        INSERT INTO outlets (id, restaurant_id, brand_id, market_id, name, phone, email, address, opening_time, closing_time, currency, country, currency_code, currency_symbol, created_at)
        VALUES (${outletId()}, ${rid}, ${brand_id||mkt?.brand_id||null}, ${market_id},
                ${name.trim()}, ${phone||null}, ${email||null}, ${address||null},
                ${opening_time||'09:00'}, ${closing_time||'22:00'}, ${mkt?.currency_code||currency||'USD'},
                ${mkt?.country||country||null}, ${mkt?.currency_code||currency_code||'USD'}, ${mkt?.currency_symbol||currency_symbol||'$'}, ${Date.now()})
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/outlets/:id', async (req, res) => {
    const { name, brand_id, market_id, phone, email, address, opening_time, closing_time, currency, country, currency_code, currency_symbol } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE outlets SET
          name            = COALESCE(NULLIF(${(name||'').trim()}, ''), name),
          brand_id        = ${brand_id !== undefined ? (brand_id || null) : sql`brand_id`},
          market_id       = ${market_id !== undefined ? (market_id || null) : sql`market_id`},
          phone           = COALESCE(NULLIF(${phone||''}, ''), phone),
          email           = COALESCE(NULLIF(${email||''}, ''), email),
          address         = COALESCE(NULLIF(${address||''}, ''), address),
          opening_time    = COALESCE(NULLIF(${opening_time||''}, ''), opening_time),
          closing_time    = COALESCE(NULLIF(${closing_time||''}, ''), closing_time),
          currency        = COALESCE(NULLIF(${currency||''}, ''), currency),
          country         = COALESCE(NULLIF(${country||''}, ''), country),
          currency_code   = COALESCE(NULLIF(${currency_code||''}, ''), currency_code),
          currency_symbol = COALESCE(NULLIF(${currency_symbol||''}, ''), currency_symbol)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'Outlet not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/outlets/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      await sql`DELETE FROM outlets WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── TABLE SECTIONS ─────────────────────────────────────────────────────────
  router.get('/table-sections', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      const rows = await sql`SELECT * FROM table_sections WHERE restaurant_id = ${rid} ORDER BY sort_order, name`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/table-sections', async (req, res) => {
    const { name } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO table_sections (id, restaurant_id, name, sort_order, created_at)
        VALUES (${newId()}, ${rid}, ${name.trim()},
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM table_sections WHERE restaurant_id = ${rid}),
          ${Date.now()})
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/table-sections/:id', async (req, res) => {
    const { name, sort_order } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE table_sections SET
          name       = COALESCE(NULLIF(${(name||'').trim()}, ''), name),
          sort_order = COALESCE(${sort_order != null ? parseInt(sort_order) : null}, sort_order)
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/table-sections/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      // Unlink tables from this section before deleting
      await sql`UPDATE tables_layout SET section_id = NULL WHERE section_id = ${req.params.id} AND restaurant_id = ${rid}`
      await sql`DELETE FROM table_sections WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── TABLES (layout management) ─────────────────────────────────────────────
  router.get('/tables', async (req, res) => {
    const rid = req.user.restaurant_id
    const oid = req.query.outlet_id || null
    try {
      const rows = oid
        ? await sql`
          SELECT t.*, s.name AS section_name
          FROM tables_layout t
          LEFT JOIN table_sections s ON s.id = t.section_id
          WHERE t.restaurant_id = ${rid} AND (t.outlet_id = ${oid} OR t.outlet_id IS NULL)
          ORDER BY s.sort_order NULLS LAST, t.name`
        : await sql`
          SELECT t.*, s.name AS section_name
          FROM tables_layout t
          LEFT JOIN table_sections s ON s.id = t.section_id
          WHERE t.restaurant_id = ${rid}
          ORDER BY s.sort_order NULLS LAST, t.name`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/tables', async (req, res) => {
    const { name, capacity, section_id, outlet_id } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO tables_layout (id, name, capacity, status, restaurant_id, section_id, outlet_id)
        VALUES (${newId()}, ${name.trim()}, ${parseInt(capacity) || 4}, 'available', ${rid}, ${section_id || null}, ${outlet_id || null})
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/tables/:id', async (req, res) => {
    const { name, capacity, section_id } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE tables_layout SET
          name       = COALESCE(NULLIF(${(name||'').trim()}, ''), name),
          capacity   = COALESCE(${capacity != null ? parseInt(capacity) : null}, capacity),
          section_id = ${section_id !== undefined ? (section_id || null) : sql`section_id`}
        WHERE id = ${req.params.id} AND restaurant_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/tables/:id', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      await sql`DELETE FROM tables_layout WHERE id = ${req.params.id} AND restaurant_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── POS BUTTON CONFIG ─────────────────────────────────────────────────────
  const POS_BUTTONS_DEF = [
    { key: 'discount',  label: 'Discount',       sort_order: 0,  default_visible: true  },
    { key: 'note',      label: 'Order Note',      sort_order: 1,  default_visible: true  },
    { key: 'hold',      label: 'Hold Order',      sort_order: 2,  default_visible: false },
    { key: 'recall',    label: 'Recall',          sort_order: 3,  default_visible: false },
    { key: 'draft',     label: 'Draft Bill',      sort_order: 4,  default_visible: false },
    { key: 'cancel',    label: 'Cancel Order',    sort_order: 5,  default_visible: false },
    { key: 'waiter',    label: 'Waiter/Captain',  sort_order: 6,  default_visible: false },
    { key: 'split',     label: 'Split Payment',   sort_order: 7,  default_visible: false },
    { key: 'transfer',  label: 'Transfer Table',  sort_order: 8,  default_visible: false },
    { key: 'comp',      label: 'Comp Item',       sort_order: 9,  default_visible: false },
  ]

  router.get('/pos-buttons', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      const saved = await sql`SELECT button_key, visible, sort_order FROM pos_button_config WHERE restaurant_id = ${rid}`
      const savedMap = Object.fromEntries(saved.map(r => [r.button_key, r]))
      const rows = POS_BUTTONS_DEF.map(d => ({
        key:         d.key,
        label:       d.label,
        visible:     savedMap[d.key] ? savedMap[d.key].visible : d.default_visible,
        sort_order:  savedMap[d.key] ? savedMap[d.key].sort_order : d.sort_order,
      }))
      rows.sort((a, b) => a.sort_order - b.sort_order)
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/pos-buttons', async (req, res) => {
    const rid = req.user.restaurant_id
    if (!rid) return res.status(400).json({ error: 'No restaurant linked to this account' })
    const { buttons } = req.body || {}
    if (!Array.isArray(buttons)) return res.status(400).json({ error: 'buttons array required' })
    try {
      for (const b of buttons) {
        await sql`
          INSERT INTO pos_button_config (id, restaurant_id, button_key, visible, sort_order)
          VALUES (${newId()}, ${rid}, ${b.key}, ${!!b.visible}, ${parseInt(b.sort_order) || 0})
          ON CONFLICT (restaurant_id, button_key)
          DO UPDATE SET visible = EXCLUDED.visible, sort_order = EXCLUDED.sort_order`
      }
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── TAX GROUPS ─────────────────────────────────────────────────────────────
  router.get('/tax-groups', async (req, res) => {
    const rid = req.user.restaurant_id
    const oid = req.query.outlet_id || null
    try {
      const rows = oid
        ? await sql`SELECT * FROM tax_groups WHERE restaurant_id = ${rid} AND (outlet_id = ${oid} OR outlet_id IS NULL) ORDER BY created_at`
        : await sql`SELECT * FROM tax_groups WHERE restaurant_id = ${rid} ORDER BY created_at`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/tax-groups', async (req, res) => {
    const { name, rate, is_default, outlet_id } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      if (is_default) await sql`UPDATE tax_groups SET is_default = false WHERE restaurant_id = ${rid}`
      const [row] = await sql`
        INSERT INTO tax_groups (id, restaurant_id, outlet_id, name, rate, is_default, created_at)
        VALUES (${newId()}, ${rid}, ${outlet_id || null}, ${name.trim()}, ${parseFloat(rate) || 0}, ${!!is_default}, ${Date.now()})
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

  // ── PAYMENT METHODS (global — outlet toggle only) ─────────────────────────
  router.get('/payment-methods', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      const rows = await sql`
        SELECT g.*, (ohp.method_id IS NOT NULL) AS hidden
        FROM global_payment_methods g
        LEFT JOIN outlet_hidden_payments ohp
          ON ohp.method_id = g.id AND ohp.restaurant_id = ${rid}
        WHERE g.active = true
        ORDER BY g.sort_order, g.name`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Toggle visibility: hidden=true → hide from this outlet, hidden=false → show
  router.patch('/payment-methods/:id', async (req, res) => {
    const { hidden } = req.body || {}
    const rid = req.user.restaurant_id
    if (!rid) return res.status(400).json({ error: 'No restaurant linked' })
    try {
      if (hidden) {
        await sql`INSERT INTO outlet_hidden_payments (restaurant_id, method_id)
                  VALUES (${rid}, ${req.params.id}) ON CONFLICT DO NOTHING`
      } else {
        await sql`DELETE FROM outlet_hidden_payments WHERE restaurant_id = ${rid} AND method_id = ${req.params.id}`
      }
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── DELIVERY PARTNERS (global — outlet toggle only) ────────────────────────
  router.get('/delivery-partners', async (req, res) => {
    const rid = req.user.restaurant_id
    try {
      const rows = await sql`
        SELECT g.*, (ohp.partner_id IS NOT NULL) AS hidden
        FROM global_delivery_partners g
        LEFT JOIN outlet_hidden_partners ohp
          ON ohp.partner_id = g.id AND ohp.restaurant_id = ${rid}
        WHERE g.active = true
        ORDER BY g.sort_order, g.name`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/delivery-partners/:id', async (req, res) => {
    const { hidden } = req.body || {}
    const rid = req.user.restaurant_id
    if (!rid) return res.status(400).json({ error: 'No restaurant linked' })
    try {
      if (hidden) {
        await sql`INSERT INTO outlet_hidden_partners (restaurant_id, partner_id)
                  VALUES (${rid}, ${req.params.id}) ON CONFLICT DO NOTHING`
      } else {
        await sql`DELETE FROM outlet_hidden_partners WHERE restaurant_id = ${rid} AND partner_id = ${req.params.id}`
      }
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── ORDER TYPES ────────────────────────────────────────────────────────────
  router.get('/order-types', async (req, res) => {
    const rid = req.user.restaurant_id
    const oid = req.query.outlet_id || null
    try {
      let rows = oid
        ? await sql`SELECT * FROM order_types WHERE restaurant_id = ${rid} AND (outlet_id = ${oid} OR outlet_id IS NULL) ORDER BY sort_order, name`
        : await sql`SELECT * FROM order_types WHERE restaurant_id = ${rid} ORDER BY sort_order, name`
      if (!rows.length && !oid) {
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
    const { name, icon, logo_url, outlet_id } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO order_types (id, restaurant_id, outlet_id, name, enabled, icon, logo_url, sort_order)
        VALUES (${newId()}, ${rid}, ${outlet_id || null}, ${name.trim()}, true, ${icon || ''}, ${logo_url || null},
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM order_types WHERE restaurant_id = ${rid}))
        RETURNING *`
      res.json(row)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/order-types/:id', async (req, res) => {
    const { name, enabled, logo_url } = req.body || {}
    const rid = req.user.restaurant_id
    try {
      const [row] = await sql`
        UPDATE order_types SET
          name     = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          enabled  = COALESCE(${enabled !== undefined ? !!enabled : null}, enabled),
          logo_url = CASE WHEN ${logo_url !== undefined} THEN ${logo_url ?? null} ELSE logo_url END
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
    const oid = req.query.outlet_id || null
    try {
      const rows = oid
        ? await sql`SELECT * FROM kitchens WHERE restaurant_id = ${rid} AND (outlet_id = ${oid} OR outlet_id IS NULL) ORDER BY sort_order, name`
        : await sql`SELECT * FROM kitchens WHERE restaurant_id = ${rid} ORDER BY sort_order, name`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/kitchens', async (req, res) => {
    const { name, color, outlet_id } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO kitchens (id, restaurant_id, outlet_id, name, color, enabled, sort_order)
        VALUES (${newId()}, ${rid}, ${outlet_id || null}, ${name.trim()}, ${color || '#6366f1'}, true,
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
    const oid = req.query.outlet_id || null
    try {
      let rows = oid
        ? await sql`SELECT * FROM designations WHERE restaurant_id = ${rid} AND (outlet_id = ${oid} OR outlet_id IS NULL) ORDER BY access_level, name`
        : await sql`SELECT * FROM designations WHERE restaurant_id = ${rid} ORDER BY access_level, name`
      if (!rows.length && !oid) {
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
    const { name, access_level, permissions, outlet_id } = req.body || {}
    const rid = req.user.restaurant_id
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const [row] = await sql`
        INSERT INTO designations (id, restaurant_id, outlet_id, name, access_level, permissions)
        VALUES (${newId()}, ${rid}, ${outlet_id || null}, ${name.trim()}, ${parseInt(access_level) || 1}, ${sql.json(permissions || {})})
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
