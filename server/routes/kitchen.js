'use strict'

const express = require('express')
const { apiKey, requireTenantTerminal } = require('../middleware/apiKey')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

module.exports = function kitchenRouter (sql) {
  const router = express.Router()

  // Auth: terminal API key, JWT (back office), or unauthenticated KDS with brand_id query param.
  // Kitchen order data is non-sensitive (food items only); public KDS screens pass brand_id to scope.
  function authAny (req, res, next) {
    if (req.headers['authorization']) return jwtAuth(req, res, next)
    if (req.headers['x-api-key'])     return apiKey(req, res, next)
    if (req.query.brand_id)           return next()   // public KDS screen scoped by brand_id
    return apiKey(req, res, next)                      // will return 401
  }

  function scope (req) {
    if (req.terminal) {
      return { brand_id: req.terminal.brand_id, outlet_id: req.terminal.outlet_id }
    }
    return {
      brand_id:  req.user?.brand_id  || req.query.brand_id  || '',
      outlet_id: req.user?.outlet_id || req.query.outlet_id || null,
    }
  }

  // GET /kitchen/orders — active orders + items for caller's outlet
  router.get('/orders', authAny, async (req, res) => {
    const { brand_id, outlet_id } = scope(req)
    try {
      // Back-office outlet override must belong to caller's brand
      if (!req.terminal && outlet_id) {
        const [owned] = await sql`SELECT id FROM outlets WHERE id = ${outlet_id} AND brand_id = ${brand_id}`
        if (!owned) return res.status(403).json({ error: 'Outlet not in your brand' })
      }

      const itemFields = sql`
        json_build_object(
          'id',           oi.id,
          'item_name',    oi.item_name,
          'kitchen_name', mi.kitchen_name,
          'variant_name', oi.variant_name,
          'modifiers',    oi.modifiers,
          'quantity',     oi.quantity,
          'notes',        oi.notes,
          'done',         COALESCE(oi.done, false)
        )`

      const orders = outlet_id
        ? await sql`
            SELECT o.id, o.order_number, o.order_type, o.table_name, o.customer_name,
                   o.status, o.created_at, o.terminal_id, o.cashier_name, o.waiter_name,
                   o.total, o.outlet_id, o.brand_id,
                   json_agg(${itemFields} ORDER BY oi.item_name) AS items
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu_items mi ON mi.id = oi.item_id
            WHERE o.status = 'active'
              AND o.brand_id  = ${brand_id}
              AND o.outlet_id = ${outlet_id}
            GROUP BY o.id
            ORDER BY o.created_at ASC`
        : await sql`
            SELECT o.id, o.order_number, o.order_type, o.table_name, o.customer_name,
                   o.status, o.created_at, o.terminal_id, o.cashier_name, o.waiter_name,
                   o.total, o.outlet_id, o.brand_id,
                   json_agg(${itemFields} ORDER BY oi.item_name) AS items
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu_items mi ON mi.id = oi.item_id
            WHERE o.status = 'active'
              AND o.brand_id = ${brand_id}
            GROUP BY o.id
            ORDER BY o.created_at ASC`
      res.json({ orders })
    } catch (e) { serverError(res, e) }
  })

  // PATCH /kitchen/items/:itemId/done — mark one item as prepared
  router.patch('/items/:itemId/done', authAny, async (req, res) => {
    const { itemId } = req.params
    const { done = true } = req.body || {}
    const { brand_id, outlet_id } = scope(req)
    try {
      // Verify item belongs to caller's brand and outlet
      const [item] = outlet_id
        ? await sql`
            SELECT oi.id, oi.order_id, o.brand_id, o.outlet_id
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.id = ${itemId} AND o.brand_id = ${brand_id} AND o.outlet_id = ${outlet_id}`
        : await sql`
            SELECT oi.id, oi.order_id, o.brand_id, o.outlet_id
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.id = ${itemId} AND o.brand_id = ${brand_id}`
      if (!item) return res.status(404).json({ error: 'Item not found' })
      if (outlet_id && item.outlet_id && item.outlet_id !== outlet_id)
        return res.status(403).json({ error: 'Item belongs to another outlet' })

      await sql`UPDATE order_items SET done = ${done} WHERE id = ${itemId}`
      req.io?.to('rest:' + brand_id).emit('kitchen:item_done', { orderId: item.order_id, itemId, done })
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // PATCH /kitchen/orders/:id/done — mark entire order as ready
  router.patch('/orders/:id/done', authAny, async (req, res) => {
    const { id } = req.params
    const { brand_id, outlet_id } = scope(req)
    try {
      const [order] = outlet_id
        ? await sql`SELECT id, brand_id, outlet_id FROM orders WHERE id = ${id} AND brand_id = ${brand_id} AND outlet_id = ${outlet_id}`
        : await sql`SELECT id, brand_id, outlet_id FROM orders WHERE id = ${id} AND brand_id = ${brand_id}`
      if (!order) return res.status(404).json({ error: 'Order not found' })
      if (outlet_id && order.outlet_id && order.outlet_id !== outlet_id)
        return res.status(403).json({ error: 'Order belongs to another outlet' })

      await sql`UPDATE order_items SET done = true WHERE order_id = ${id}`
      req.io?.to('rest:' + brand_id).emit('order:done', { orderId: id })
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  return router
}
