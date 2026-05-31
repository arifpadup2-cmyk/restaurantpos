'use strict'

const express = require('express')
const { randomUUID } = require('crypto')
const { jwtAuth, requireRole } = require('../middleware/jwtAuth')
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

  // PUT /orders/:id — edit invoice detail (Tier A: attribution/contact only).
  // Owner/admin only. Financial fields (items, totals, payments) are intentionally
  // NOT editable here — those need a credit-note/recompute flow (separate phase).
  const TIER_A = ['customer_name', 'customer_phone', 'customer_address',
                  'waiter_id', 'waiter_name', 'order_type', 'notes']
  const VALID_ORDER_TYPES = new Set(['dine-in', 'takeaway', 'delivery', 'online', 'drive-thru'])

  router.put('/:id', requireRole('owner', 'admin'), async (req, res) => {
    const rid = req.user.brand_id || ''
    const id  = req.params.id
    const body = req.body || {}
    try {
      const [order] = await sql`SELECT * FROM orders WHERE id = ${id} AND brand_id = ${rid}`
      if (!order) return res.status(404).json({ error: 'Invoice not found in your brand' })

      // Build a whitelisted patch from only the fields actually provided.
      const patch = {}
      const changes = {}
      for (const col of TIER_A) {
        if (!(col in body)) continue
        let val = body[col]
        if (typeof val === 'string') val = val.trim()
        if (val === '') val = null
        if (col === 'order_type' && val && !VALID_ORDER_TYPES.has(val))
          return res.status(400).json({ error: `Invalid order_type: ${val}` })
        const prev = order[col] ?? null
        if ((prev ?? null) === (val ?? null)) continue   // no-op
        patch[col] = val
        changes[col] = { from: prev ?? null, to: val ?? null }
      }

      if (Object.keys(patch).length === 0)
        return res.json({ ok: true, changed: 0, order })

      const now = Date.now()
      const [updated] = await sql`
        UPDATE orders SET ${sql(patch)}, updated_at = ${now}
        WHERE id = ${id} AND brand_id = ${rid}
        RETURNING *`

      // Audit trail — who changed what, before → after.
      const actor = req.user.name || req.user.username || req.user.id || 'back-office'
      await sql`
        INSERT INTO audit_log (id, action, entity_type, entity_id, cashier_id, cashier_name,
                               details, created_at, brand_id)
        VALUES (${randomUUID()}, 'invoice_edit', 'order', ${id}, ${req.user.id || null}, ${actor},
                ${JSON.stringify({ order_number: order.order_number, changes })}, ${now}, ${rid})`

      res.json({ ok: true, changed: Object.keys(changes).length, order: updated })
    } catch (e) { serverError(res, e) }
  })

  return router
}
