'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function ordersRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  // GET /orders?date=YYYY-MM-DD
  router.get('/', async (req, res) => {
    const date  = req.query.date || new Date().toISOString().split('T')[0]
    const start = new Date(date).getTime()
    const end   = start + 86400000

    try {
      const orders = await sql`
        SELECT o.*, json_agg(oi ORDER BY oi.id) AS items
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.created_at >= ${start} AND o.created_at < ${end}
        GROUP BY o.id
        ORDER BY o.created_at DESC`
      res.json({ orders })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
