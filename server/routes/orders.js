'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')
const logger  = require('../lib/logger')

module.exports = function ordersRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  // Log all order mutations via middleware
  router.use((req, _res, next) => {
    if (req.method !== 'GET') {
      logger.info('orders', `order_${req.method.toLowerCase()}`, logger.ctxFromReq(req), {
        order_id: req.params?.id || req.body?.id || '',
        status:   req.body?.status || '',
      })
    }
    next()
  })

  // GET /orders?date=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD&outlet_id=
  router.get('/', async (req, res) => {
    const rid = req.user.brand_id || ''
    const { date, from, to, outlet_id } = req.query
    const d     = from || date || new Date().toISOString().split('T')[0]
    const start = new Date(d).getTime()
    const end   = to ? new Date(to).getTime() + 86400000 : start + 86400000
    try {
      if (outlet_id) {
        const [owned] = await sql`SELECT id FROM outlets WHERE id = ${outlet_id} AND brand_id = ${rid}`
        if (!owned) return res.status(403).json({ error: 'Outlet not found in your brand' })
      }

      const orders = outlet_id
        ? await sql`
            SELECT o.*, json_agg(oi ORDER BY oi.id) AS items,
              COALESCE((SELECT json_agg(op ORDER BY op.created_at)
                        FROM order_payments op WHERE op.order_id = o.id), '[]') AS payments
            FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= ${start} AND o.created_at < ${end}
              AND o.outlet_id = ${outlet_id}
              AND o.brand_id  = ${rid}
            GROUP BY o.id ORDER BY o.created_at DESC`
        : await sql`
            SELECT o.*, json_agg(oi ORDER BY oi.id) AS items,
              COALESCE((SELECT json_agg(op ORDER BY op.created_at)
                        FROM order_payments op WHERE op.order_id = o.id), '[]') AS payments
            FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= ${start} AND o.created_at < ${end}
              AND o.brand_id = ${rid}
            GROUP BY o.id ORDER BY o.created_at DESC`
      res.json({ orders })
    } catch (e) { serverError(res, e) }
  })

  return router
}
