'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

module.exports = function reportsRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  function dateRange (from, to) {
    const start = new Date(from || new Date().toISOString().split('T')[0]).getTime()
    const end   = new Date(to || from || new Date().toISOString().split('T')[0]).getTime() + 86400000
    return { start, end }
  }

  // Validates that every outlet_id in the array belongs to the requesting brand.
  // Returns the validated array, or throws a 403 response if any is foreign.
  async function resolveOutletIds (req, res, outlet_id, brand_id, market_id, country) {
    const rid = req.user.brand_id
    if (outlet_id) {
      const [owned] = await sql`SELECT id FROM outlets WHERE id = ${outlet_id} AND brand_id = ${rid}`
      if (!owned) { res.status(403).json({ error: 'Outlet not found in your brand' }); return null }
      return [outlet_id]
    }
    if (brand_id || market_id || country) {
      const outlets = await sql`
        SELECT id FROM outlets
        WHERE brand_id = ${rid}
        ${brand_id  ? sql`AND brand_id  = ${brand_id}`  : sql``}
        ${market_id ? sql`AND market_id = ${market_id}` : sql``}
        ${country   ? sql`AND country   = ${country}`   : sql``}`
      return outlets.map(o => o.id)
    }
    return null
  }

  // GET /reports/dashboard?date=YYYY-MM-DD&outlet_id=&brand_id=&country=
  router.get('/dashboard', async (req, res) => {
    const { date, from, to, outlet_id, brand_id, market_id, country } = req.query
    const fromDate = from || date || new Date().toISOString().split('T')[0]
    const toDate   = to   || date || fromDate
    const { start, end } = dateRange(fromDate, toDate)
    const rid = req.user.brand_id
    try {
      const outletIds = await resolveOutletIds(req, res, outlet_id, brand_id, market_id, country)
      if (outletIds === null && res.headersSent) return
      if (Array.isArray(outletIds) && outletIds.length === 0) return res.json({ orders: [], expenses: [] })
      const [orders, exps] = await Promise.all([
        outletIds
          ? sql`SELECT o.*, json_agg(oi ORDER BY oi.id) AS items FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id WHERE o.created_at >= ${start} AND o.created_at < ${end} AND o.status = 'paid' AND o.outlet_id = ANY(${outletIds}) GROUP BY o.id ORDER BY o.created_at DESC`
          : sql`SELECT o.*, json_agg(oi ORDER BY oi.id) AS items FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id WHERE o.created_at >= ${start} AND o.created_at < ${end} AND o.status = 'paid' AND o.brand_id = ${rid} GROUP BY o.id ORDER BY o.created_at DESC`,
        outletIds
          ? sql`SELECT * FROM expenses WHERE created_at >= ${start} AND created_at < ${end} AND outlet_id = ANY(${outletIds})`
          : sql`SELECT * FROM expenses WHERE created_at >= ${start} AND created_at < ${end} AND brand_id = ${rid}`,
      ])
      res.json({ orders, expenses: exps })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports?from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=&brand_id=&market_id=
  router.get('/', async (req, res) => {
    const { from, to, outlet_id, brand_id, market_id, country } = req.query
    const { start, end } = dateRange(from, to)
    const rid = req.user.brand_id
    try {
      const outletIds = await resolveOutletIds(req, res, outlet_id, brand_id, market_id, country)
      if (outletIds === null && res.headersSent) return
      if (Array.isArray(outletIds) && outletIds.length === 0) return res.json({ orders: [], expenses: [] })
      const [orders, exps] = await Promise.all([
        outletIds
          ? sql`SELECT * FROM orders WHERE created_at >= ${start} AND created_at < ${end} AND status = 'paid' AND outlet_id = ANY(${outletIds}) ORDER BY created_at`
          : sql`SELECT * FROM orders WHERE created_at >= ${start} AND created_at < ${end} AND status = 'paid' AND brand_id = ${rid} ORDER BY created_at`,
        outletIds
          ? sql`SELECT * FROM expenses WHERE created_at >= ${start} AND created_at < ${end} AND outlet_id = ANY(${outletIds}) ORDER BY created_at`
          : sql`SELECT * FROM expenses WHERE created_at >= ${start} AND created_at < ${end} AND brand_id = ${rid} ORDER BY created_at`,
      ])
      res.json({ orders, expenses: exps })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=
  router.get('/expenses', async (req, res) => {
    const { from, to, outlet_id } = req.query
    const { start, end } = dateRange(from, to)
    const rid = req.user.brand_id
    try {
      if (outlet_id) {
        const [owned] = await sql`SELECT id FROM outlets WHERE id = ${outlet_id} AND brand_id = ${rid}`
        if (!owned) return res.status(403).json({ error: 'Outlet not found in your brand' })
      }
      const exps = outlet_id
        ? await sql`
            SELECT * FROM expenses
            WHERE created_at >= ${start} AND created_at < ${end}
              AND outlet_id = ${outlet_id} AND brand_id = ${rid}
            ORDER BY created_at DESC`
        : await sql`
            SELECT * FROM expenses
            WHERE created_at >= ${start} AND created_at < ${end}
              AND brand_id = ${rid}
            ORDER BY created_at DESC`
      res.json({ expenses: exps })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/item-consumption?from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=&brand_id=&country=
  router.get('/item-consumption', async (req, res) => {
    const { from, to, outlet_id, brand_id, country } = req.query
    const { start, end } = dateRange(from, to)
    const rid = req.user.brand_id
    try {
      const outletIds = await resolveOutletIds(req, res, outlet_id, brand_id, null, country)
      if (outletIds === null && res.headersSent) return
      if (Array.isArray(outletIds) && outletIds.length === 0) return res.json({ rows: [] })

      const rows = await (outletIds
        ? sql`
          SELECT oi.item_name,
                 COALESCE(oi.category_name, 'Uncategorised') AS category_name,
                 SUM(oi.quantity)::int            AS total_qty,
                 COUNT(DISTINCT o.id)::int        AS order_count,
                 SUM(oi.total_price)              AS total_revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.created_at >= ${start} AND o.created_at < ${end}
            AND o.status = 'paid' AND o.outlet_id = ANY(${outletIds})
          GROUP BY oi.item_name, oi.category_name
          ORDER BY total_qty DESC`
        : sql`
          SELECT oi.item_name,
                 COALESCE(oi.category_name, 'Uncategorised') AS category_name,
                 SUM(oi.quantity)::int            AS total_qty,
                 COUNT(DISTINCT o.id)::int        AS order_count,
                 SUM(oi.total_price)              AS total_revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.created_at >= ${start} AND o.created_at < ${end}
            AND o.status = 'paid' AND o.brand_id = ${rid}
          GROUP BY oi.item_name, oi.category_name
          ORDER BY total_qty DESC`)
      res.json({ rows })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/wastage?from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=
  router.get('/wastage', async (req, res) => {
    const { from, to, outlet_id } = req.query
    const { start, end } = dateRange(from, to)
    const rid = req.user.brand_id
    try {
      if (outlet_id) {
        const [owned] = await sql`SELECT id FROM outlets WHERE id = ${outlet_id} AND brand_id = ${rid}`
        if (!owned) return res.status(403).json({ error: 'Outlet not found in your brand' })
      }
      const rows = outlet_id
        ? await sql`
            SELECT o.order_number, o.order_type, o.cashier_name, o.total,
                   o.void_reason, o.voided_by, o.created_at, o.status,
                   json_agg(
                     json_build_object(
                       'item_name',  oi.item_name,
                       'quantity',   oi.quantity,
                       'total_price',oi.total_price
                     )
                   ) AS items
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= ${start} AND o.created_at < ${end}
              AND o.status IN ('void','cancelled')
              AND o.outlet_id = ${outlet_id} AND o.brand_id = ${rid}
            GROUP BY o.id
            ORDER BY o.created_at DESC`
        : await sql`
            SELECT o.order_number, o.order_type, o.cashier_name, o.total,
                   o.void_reason, o.voided_by, o.created_at, o.status,
                   json_agg(
                     json_build_object(
                       'item_name',  oi.item_name,
                       'quantity',   oi.quantity,
                       'total_price',oi.total_price
                     )
                   ) AS items
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= ${start} AND o.created_at < ${end}
              AND o.status IN ('void','cancelled')
              AND o.outlet_id IN (SELECT id FROM outlets WHERE brand_id = ${rid})
            GROUP BY o.id
            ORDER BY o.created_at DESC`
      res.json({ rows })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/device-activity?from=UNIX_MS&to=UNIX_MS
  router.get('/device-activity', async (req, res) => {
    const from = Number(req.query.from) || new Date().setHours(0,0,0,0)
    const to   = Number(req.query.to)   || Date.now()
    const rid  = req.user.brand_id
    try {
      const rows = await sql`
        SELECT terminal_id,
               COUNT(*)::int              AS event_count,
               MIN(created_at)            AS first_event,
               MAX(created_at)            AS last_event,
               COUNT(DISTINCT COALESCE(cashier_name,'?'))::int AS cashier_count,
               SUM(CASE WHEN action='void_order'        THEN 1 ELSE 0 END)::int AS voids,
               SUM(CASE WHEN action='cancel_order'      THEN 1 ELSE 0 END)::int AS cancels,
               SUM(CASE WHEN action='discount'          THEN 1 ELSE 0 END)::int AS discounts,
               SUM(CASE WHEN action='manager_approval'  THEN 1 ELSE 0 END)::int AS approvals
        FROM audit_log
        WHERE created_at >= ${from} AND created_at <= ${to}
          AND terminal_id IS NOT NULL
          AND brand_id = ${rid}
        GROUP BY terminal_id
        ORDER BY event_count DESC`
      res.json({ rows })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/filter-options — brands, markets, outlets for this restaurant
  router.get('/filter-options', async (req, res) => {
    const rid = req.user.brand_id
    try {
      const [brands, markets, outlets] = await Promise.all([
        sql`SELECT id, name FROM brands WHERE id = ${rid} ORDER BY name`,
        sql`SELECT id, name, brand_id, country, currency_code, currency_symbol FROM markets WHERE brand_id = ${rid} ORDER BY name`,
        sql`SELECT id, name, brand_id, market_id, country, currency_code, currency_symbol FROM outlets WHERE brand_id = ${rid} ORDER BY name`,
      ])
      res.json({ brands, markets, outlets })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/item-sales?from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=&market_id=
  router.get('/item-sales', async (req, res) => {
    const { from, to, outlet_id, market_id } = req.query
    const { start, end } = dateRange(from, to)
    const rid = req.user.brand_id
    try {
      const outletIds = await resolveOutletIds(req, res, outlet_id, null, market_id, null)
      if (outletIds === null && res.headersSent) return
      if (Array.isArray(outletIds) && outletIds.length === 0) return res.json({ rows: [] })
      const rows = outletIds
        ? await sql`
          SELECT oi.item_name,
                 COALESCE(oi.category_name,'Uncategorised') AS category_name,
                 SUM(oi.quantity)::int       AS total_qty,
                 COUNT(DISTINCT o.id)::int  AS order_count,
                 SUM(oi.total_price)        AS total_revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.created_at >= ${start} AND o.created_at < ${end}
            AND o.status = 'paid' AND oi.cancelled = 0
            AND o.outlet_id = ANY(${outletIds})
          GROUP BY oi.item_name, oi.category_name
          ORDER BY total_qty DESC`
        : await sql`
          SELECT oi.item_name,
                 COALESCE(oi.category_name,'Uncategorised') AS category_name,
                 SUM(oi.quantity)::int       AS total_qty,
                 COUNT(DISTINCT o.id)::int  AS order_count,
                 SUM(oi.total_price)        AS total_revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.created_at >= ${start} AND o.created_at < ${end}
            AND o.status = 'paid' AND oi.cancelled = 0
            AND o.brand_id = ${rid}
          GROUP BY oi.item_name, oi.category_name
          ORDER BY total_qty DESC`
      res.json({ rows })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/canceled-items?from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=&market_id=
  router.get('/canceled-items', async (req, res) => {
    const { from, to, outlet_id, market_id } = req.query
    const { start, end } = dateRange(from, to)
    const rid = req.user.brand_id
    try {
      const outletIds = await resolveOutletIds(req, res, outlet_id, null, market_id, null)
      if (outletIds === null && res.headersSent) return
      if (Array.isArray(outletIds) && outletIds.length === 0) return res.json({ rows: [] })
      const rows = outletIds
        ? await sql`
          SELECT oi.item_name, COALESCE(oi.category_name,'Uncategorised') AS category_name,
                 oi.quantity, oi.total_price, oi.void_reason, oi.voided_by,
                 o.order_number, o.cashier_name, o.created_at, o.outlet_id
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.cancelled = 1
            AND o.created_at >= ${start} AND o.created_at < ${end}
            AND o.outlet_id = ANY(${outletIds})
          ORDER BY o.created_at DESC`
        : await sql`
          SELECT oi.item_name, COALESCE(oi.category_name,'Uncategorised') AS category_name,
                 oi.quantity, oi.total_price, oi.void_reason, oi.voided_by,
                 o.order_number, o.cashier_name, o.created_at, o.outlet_id
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.cancelled = 1
            AND o.created_at >= ${start} AND o.created_at < ${end}
            AND o.brand_id = ${rid}
          ORDER BY o.created_at DESC`
      res.json({ rows })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/canceled-bills?from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=&market_id=
  router.get('/canceled-bills', async (req, res) => {
    const { from, to, outlet_id, market_id } = req.query
    const { start, end } = dateRange(from, to)
    const rid = req.user.brand_id
    try {
      const outletIds = await resolveOutletIds(req, res, outlet_id, null, market_id, null)
      if (outletIds === null && res.headersSent) return
      if (Array.isArray(outletIds) && outletIds.length === 0) return res.json({ rows: [] })
      const rows = outletIds
        ? await sql`
          SELECT o.order_number, o.order_type, o.cashier_name, o.subtotal, o.tax_amount,
                 o.total, o.void_reason, o.voided_by, o.created_at, o.status, o.outlet_id,
                 json_agg(json_build_object('item_name',oi.item_name,'quantity',oi.quantity,'total_price',oi.total_price) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL) AS items
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.status IN ('void','cancelled')
            AND o.created_at >= ${start} AND o.created_at < ${end}
            AND o.outlet_id = ANY(${outletIds})
          GROUP BY o.id ORDER BY o.created_at DESC`
        : await sql`
          SELECT o.order_number, o.order_type, o.cashier_name, o.subtotal, o.tax_amount,
                 o.total, o.void_reason, o.voided_by, o.created_at, o.status, o.outlet_id,
                 json_agg(json_build_object('item_name',oi.item_name,'quantity',oi.quantity,'total_price',oi.total_price) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL) AS items
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.status IN ('void','cancelled')
            AND o.created_at >= ${start} AND o.created_at < ${end}
            AND o.brand_id = ${rid}
          GROUP BY o.id ORDER BY o.created_at DESC`
      res.json({ rows })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/comp-bills?from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=&market_id=
  router.get('/comp-bills', async (req, res) => {
    const { from, to, outlet_id, market_id } = req.query
    const { start, end } = dateRange(from, to)
    const rid = req.user.brand_id
    try {
      const outletIds = await resolveOutletIds(req, res, outlet_id, null, market_id, null)
      if (outletIds === null && res.headersSent) return
      if (Array.isArray(outletIds) && outletIds.length === 0) return res.json({ rows: [] })
      const rows = outletIds
        ? await sql`
          SELECT o.order_number, o.order_type, o.cashier_name, o.subtotal, o.tax_amount,
                 o.total, o.payment_method, o.discount_type, o.discount_amount, o.created_at, o.outlet_id,
                 json_agg(json_build_object('item_name',oi.item_name,'quantity',oi.quantity,'total_price',oi.total_price) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL) AS items
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE (o.payment_method = 'comp' OR o.total = 0 OR o.discount_type = 'comp')
            AND o.status = 'paid'
            AND o.created_at >= ${start} AND o.created_at < ${end}
            AND o.outlet_id = ANY(${outletIds})
          GROUP BY o.id ORDER BY o.created_at DESC`
        : await sql`
          SELECT o.order_number, o.order_type, o.cashier_name, o.subtotal, o.tax_amount,
                 o.total, o.payment_method, o.discount_type, o.discount_amount, o.created_at, o.outlet_id,
                 json_agg(json_build_object('item_name',oi.item_name,'quantity',oi.quantity,'total_price',oi.total_price) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL) AS items
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE (o.payment_method = 'comp' OR o.total = 0 OR o.discount_type = 'comp')
            AND o.status = 'paid'
            AND o.created_at >= ${start} AND o.created_at < ${end}
            AND o.brand_id = ${rid}
          GROUP BY o.id ORDER BY o.created_at DESC`
      res.json({ rows })
    } catch (e) { serverError(res, e) }
  })

  // GET /reports/comp-items?from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=&market_id=
  router.get('/comp-items', async (req, res) => {
    const { from, to, outlet_id, market_id } = req.query
    const { start, end } = dateRange(from, to)
    const rid = req.user.brand_id
    try {
      const outletIds = await resolveOutletIds(req, res, outlet_id, null, market_id, null)
      if (outletIds === null && res.headersSent) return
      if (Array.isArray(outletIds) && outletIds.length === 0) return res.json({ rows: [] })
      const rows = outletIds
        ? await sql`
          SELECT oi.item_name, COALESCE(oi.category_name,'Uncategorised') AS category_name,
                 SUM(oi.quantity)::int AS total_qty,
                 COUNT(DISTINCT o.id)::int AS order_count,
                 SUM(oi.total_price) AS total_value
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE (o.payment_method = 'comp' OR o.total = 0 OR o.discount_type = 'comp')
            AND o.status = 'paid'
            AND o.created_at >= ${start} AND o.created_at < ${end}
            AND o.outlet_id = ANY(${outletIds})
          GROUP BY oi.item_name, oi.category_name
          ORDER BY total_qty DESC`
        : await sql`
          SELECT oi.item_name, COALESCE(oi.category_name,'Uncategorised') AS category_name,
                 SUM(oi.quantity)::int AS total_qty,
                 COUNT(DISTINCT o.id)::int AS order_count,
                 SUM(oi.total_price) AS total_value
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE (o.payment_method = 'comp' OR o.total = 0 OR o.discount_type = 'comp')
            AND o.status = 'paid'
            AND o.created_at >= ${start} AND o.created_at < ${end}
            AND o.brand_id = ${rid}
          GROUP BY oi.item_name, oi.category_name
          ORDER BY total_qty DESC`
      res.json({ rows })
    } catch (e) { serverError(res, e) }
  })

  return router
}
