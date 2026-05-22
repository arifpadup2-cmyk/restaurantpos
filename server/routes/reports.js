'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function reportsRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  // GET /reports/dashboard?date=YYYY-MM-DD
  router.get('/dashboard', async (req, res) => {
    const date  = req.query.date || new Date().toISOString().split('T')[0]
    const start = new Date(date).getTime()
    const end   = start + 86400000

    try {
      const [orders, exps] = await Promise.all([
        sql`SELECT o.*, json_agg(oi ORDER BY oi.id) AS items
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= ${start} AND o.created_at < ${end} AND o.status = 'paid'
            GROUP BY o.id
            ORDER BY o.created_at DESC`,
        sql`SELECT * FROM expenses WHERE created_at >= ${start} AND created_at < ${end}`,
      ])
      res.json({ orders, expenses: exps })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // GET /reports?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/', async (req, res) => {
    const from  = req.query.from || new Date().toISOString().split('T')[0]
    const to    = req.query.to   || from
    const start = new Date(from).getTime()
    const end   = new Date(to).getTime() + 86400000

    try {
      const [orders, exps] = await Promise.all([
        sql`SELECT * FROM orders WHERE created_at >= ${start} AND created_at < ${end} AND status = 'paid' ORDER BY created_at`,
        sql`SELECT * FROM expenses WHERE created_at >= ${start} AND created_at < ${end} ORDER BY created_at`,
      ])
      res.json({ orders, expenses: exps })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // GET /reports/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/expenses', async (req, res) => {
    const from  = req.query.from || new Date().toISOString().split('T')[0]
    const to    = req.query.to   || from
    const start = new Date(from).getTime()
    const end   = new Date(to).getTime() + 86400000

    try {
      const exps = await sql`
        SELECT * FROM expenses
        WHERE created_at >= ${start} AND created_at < ${end}
        ORDER BY created_at DESC`
      res.json({ expenses: exps })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // GET /reports/item-consumption?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/item-consumption', async (req, res) => {
    const from  = req.query.from || new Date().toISOString().split('T')[0]
    const to    = req.query.to   || from
    const start = new Date(from).getTime()
    const end   = new Date(to).getTime() + 86400000
    try {
      const rows = await sql`
        SELECT oi.item_name,
               COALESCE(oi.category_name, 'Uncategorised') AS category_name,
               SUM(oi.quantity)::int            AS total_qty,
               COUNT(DISTINCT o.id)::int        AS order_count,
               SUM(oi.total_price)              AS total_revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at >= ${start} AND o.created_at < ${end}
          AND o.status = 'paid'
        GROUP BY oi.item_name, oi.category_name
        ORDER BY total_qty DESC`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // GET /reports/wastage?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/wastage', async (req, res) => {
    const from  = req.query.from || new Date().toISOString().split('T')[0]
    const to    = req.query.to   || from
    const start = new Date(from).getTime()
    const end   = new Date(to).getTime() + 86400000
    try {
      const rows = await sql`
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
        GROUP BY o.id
        ORDER BY o.created_at DESC`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // GET /reports/device-activity?from=UNIX_MS&to=UNIX_MS
  router.get('/device-activity', async (req, res) => {
    const from = Number(req.query.from) || new Date().setHours(0,0,0,0)
    const to   = Number(req.query.to)   || Date.now()
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
        GROUP BY terminal_id
        ORDER BY event_count DESC`
      res.json({ rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
