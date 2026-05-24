'use strict'

const express  = require('express')
const bcrypt   = require('bcryptjs')
const { sign, jwtAuth } = require('../middleware/jwtAuth')
const { serverError }   = require('../middleware/serverError')

// Owner JWT carry { owner_id, username, role:'owner', brand_ids:[] }
function ownerAuth (req, res, next) {
  if (!req.user?.owner_id)
    return res.status(403).json({ error: 'Owner account required' })
  next()
}

function dateRange (from, to) {
  const start = new Date(from || new Date().toISOString().split('T')[0]).getTime()
  const end   = new Date(to   || from || new Date().toISOString().split('T')[0]).getTime() + 86400000
  return { start, end }
}

module.exports = function ownerRouter (sql) {
  const router = express.Router()

  // ── POST /owner/login ──────────────────────────────────────────────
  router.post('/login', async (req, res) => {
    const { username, password } = req.body || {}
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' })
    try {
      const [owner] = await sql`
        SELECT * FROM owners WHERE LOWER(username) = ${username.toLowerCase()}`
      if (!owner) return res.status(401).json({ error: 'Invalid username or password' })
      if (!owner.active) return res.status(401).json({ error: 'Account disabled' })

      const ok = await bcrypt.compare(password, owner.password)
      if (!ok) return res.status(401).json({ error: 'Invalid username or password' })

      const brands = await sql`
        SELECT ob.brand_id, b.name, b.business_type, b.country
        FROM owner_brands ob
        JOIN brands b ON b.id = ob.brand_id
        WHERE ob.owner_id = ${owner.id}
        ORDER BY b.name`

      const brand_ids = brands.map(b => b.brand_id)
      const token = sign({ owner_id: owner.id, username: owner.username, role: 'owner', brand_ids })

      res.json({
        ok: true,
        token,
        owner: { id: owner.id, name: owner.name, username: owner.username },
        brands,
      })
    } catch (e) { serverError(res, e) }
  })

  // ── GET /owner/me ──────────────────────────────────────────────────
  router.get('/me', jwtAuth, ownerAuth, async (req, res) => {
    try {
      const [owner] = await sql`SELECT id, name, username, email, created_at FROM owners WHERE id = ${req.user.owner_id}`
      const brands  = await sql`
        SELECT ob.brand_id, b.name, b.business_type, b.country
        FROM owner_brands ob
        JOIN brands b ON b.id = ob.brand_id
        WHERE ob.owner_id = ${req.user.owner_id}
        ORDER BY b.name`
      res.json({ owner, brands })
    } catch (e) { serverError(res, e) }
  })

  // ── GET /owner/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD ────────────
  // Consolidated multi-brand dashboard for the owner
  router.get('/dashboard', jwtAuth, ownerAuth, async (req, res) => {
    const { from, to } = req.query
    const { start, end } = dateRange(from, to)
    const brand_ids = req.user.brand_ids || []
    if (!brand_ids.length) return res.json({ summary: {}, brands: [], outlets: [] })

    try {
      // Per-brand revenue + order counts
      const brandRows = await sql`
        SELECT
          o.brand_id,
          b.name            AS brand_name,
          b.business_type,
          COUNT(o.id)::int          AS orders,
          SUM(o.total)              AS revenue,
          SUM(o.tax_amount)         AS tax,
          SUM(o.discount_amount)    AS discounts,
          AVG(o.total)              AS aov,
          SUM(CASE WHEN o.order_type='dine-in'  THEN 1 ELSE 0 END)::int AS dine_in,
          SUM(CASE WHEN o.order_type='takeaway' THEN 1 ELSE 0 END)::int AS takeaway,
          SUM(CASE WHEN o.order_type='delivery' THEN 1 ELSE 0 END)::int AS delivery,
          SUM(CASE WHEN o.payment_method='cash'    THEN 1 ELSE 0 END)::int AS cash_orders,
          SUM(CASE WHEN o.payment_method='card'    THEN 1 ELSE 0 END)::int AS card_orders,
          SUM(CASE WHEN o.payment_method='ewallet' THEN 1 ELSE 0 END)::int AS ewallet_orders
        FROM orders o
        JOIN brands b ON b.id = o.brand_id
        WHERE o.brand_id = ANY(${sql.array(brand_ids)})
          AND o.created_at >= ${start} AND o.created_at < ${end}
          AND o.status = 'paid'
        GROUP BY o.brand_id, b.name, b.business_type
        ORDER BY revenue DESC`

      // Per-outlet breakdown
      const outletRows = await sql`
        SELECT
          o.outlet_id,
          ot.name           AS outlet_name,
          o.brand_id,
          b.name            AS brand_name,
          COUNT(o.id)::int  AS orders,
          SUM(o.total)      AS revenue,
          AVG(o.total)      AS aov
        FROM orders o
        JOIN outlets ot ON ot.id = o.outlet_id
        JOIN brands  b  ON b.id  = o.brand_id
        WHERE o.brand_id = ANY(${sql.array(brand_ids)})
          AND o.created_at >= ${start} AND o.created_at < ${end}
          AND o.status = 'paid'
        GROUP BY o.outlet_id, ot.name, o.brand_id, b.name
        ORDER BY revenue DESC`

      // Top items per brand
      const itemRows = await sql`
        SELECT
          o.brand_id,
          oi.item_name,
          SUM(oi.quantity)::int     AS total_qty,
          COUNT(DISTINCT o.id)::int AS order_count,
          SUM(oi.total_price)       AS total_revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.brand_id = ANY(${sql.array(brand_ids)})
          AND o.created_at >= ${start} AND o.created_at < ${end}
          AND o.status = 'paid'
          AND oi.cancelled = 0
        GROUP BY o.brand_id, oi.item_name
        ORDER BY o.brand_id, total_revenue DESC`

      // Daily trend (last N days)
      const trendRows = await sql`
        SELECT
          o.brand_id,
          to_char(to_timestamp(o.created_at / 1000) AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') AS day,
          COUNT(o.id)::int AS orders,
          SUM(o.total)     AS revenue
        FROM orders o
        WHERE o.brand_id = ANY(${sql.array(brand_ids)})
          AND o.created_at >= ${start} AND o.created_at < ${end}
          AND o.status = 'paid'
        GROUP BY o.brand_id, day
        ORDER BY o.brand_id, day`

      // Totals summary
      const totalRevenue = brandRows.reduce((s, b) => s + parseFloat(b.revenue || 0), 0)
      const totalOrders  = brandRows.reduce((s, b) => s + (b.orders || 0), 0)
      const totalTax     = brandRows.reduce((s, b) => s + parseFloat(b.tax || 0), 0)
      const totalDisc    = brandRows.reduce((s, b) => s + parseFloat(b.discounts || 0), 0)

      // Group items by brand_id for embedding in brand rows
      const itemsByBrand = {}
      for (const row of itemRows) {
        if (!itemsByBrand[row.brand_id]) itemsByBrand[row.brand_id] = []
        if (itemsByBrand[row.brand_id].length < 10) itemsByBrand[row.brand_id].push(row)
      }

      const trendByBrand = {}
      for (const row of trendRows) {
        if (!trendByBrand[row.brand_id]) trendByBrand[row.brand_id] = []
        trendByBrand[row.brand_id].push(row)
      }

      const brands = brandRows.map(b => ({
        ...b,
        top_items: itemsByBrand[b.brand_id] || [],
        trend:     trendByBrand[b.brand_id] || [],
      }))

      res.json({
        summary: {
          total_revenue: totalRevenue,
          total_orders:  totalOrders,
          total_tax:     totalTax,
          total_discounts: totalDisc,
          brands:  brand_ids.length,
          outlets: outletRows.length,
          period:  { from: from || 'today', to: to || 'today' },
        },
        brands,
        outlets: outletRows,
      })
    } catch (e) { serverError(res, e) }
  })

  // ── POST /owner/switch/:brand_id ───────────────────────────────────
  // Returns a short-lived BO token scoped to that brand so the owner
  // can seamlessly open the brand backoffice without re-logging in.
  router.post('/switch/:brand_id', jwtAuth, ownerAuth, async (req, res) => {
    const { brand_id } = req.params
    const allowed = req.user.brand_ids || []
    if (!allowed.includes(brand_id))
      return res.status(403).json({ error: 'Brand not in your portfolio' })
    try {
      // Build a minimal bo_user-like payload for that brand
      const [brand] = await sql`SELECT id, name, owner_name FROM brands WHERE id = ${brand_id}`
      if (!brand) return res.status(404).json({ error: 'Brand not found' })

      // Issue a brand-scoped token valid for 2h (enough to review reports)
      const token = sign(
        { id: req.user.owner_id, username: req.user.username, role: 'owner', brand_id, switched_from_owner: true },
        { expiresIn: '2h' }
      )
      res.json({ ok: true, token, brand_id, brand_name: brand.name })
    } catch (e) { serverError(res, e) }
  })

  return router
}
