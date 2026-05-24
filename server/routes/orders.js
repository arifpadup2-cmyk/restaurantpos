'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

module.exports = function ordersRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  // GET /orders?date=YYYY-MM-DD&outlet_id=
  router.get('/', async (req, res) => {
    const rid = req.user.brand_id || ''
    const { date, outlet_id } = req.query
    const d     = date || new Date().toISOString().split('T')[0]
    const start = new Date(d).getTime()
    const end   = start + 86400000
    try {
      if (outlet_id) {
        const [owned] = await sql`SELECT id FROM outlets WHERE id = ${outlet_id} AND brand_id = ${rid}`
        if (!owned) return res.status(403).json({ error: 'Outlet not found in your brand' })
      }

      const orders = outlet_id
        ? await sql`
            SELECT o.*, json_agg(oi ORDER BY oi.id) AS items
            FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= ${start} AND o.created_at < ${end}
              AND o.outlet_id = ${outlet_id}
              AND o.brand_id  = ${rid}
            GROUP BY o.id ORDER BY o.created_at DESC`
        : await sql`
            SELECT o.*, json_agg(oi ORDER BY oi.id) AS items
            FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= ${start} AND o.created_at < ${end}
              AND o.brand_id = ${rid}
            GROUP BY o.id ORDER BY o.created_at DESC`
      res.json({ orders })
    } catch (e) { serverError(res, e) }
  })

  return router
}
