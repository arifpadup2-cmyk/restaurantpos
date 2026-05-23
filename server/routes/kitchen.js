'use strict'

const express = require('express')

module.exports = function kitchenRouter (sql) {
  const router = express.Router()

  // GET /kitchen/orders — all active orders with items for KDS
  router.get('/orders', async (_req, res) => {
    try {
      const orders = await sql`
        SELECT o.id, o.order_number, o.order_type, o.table_name, o.customer_name,
               o.status, o.created_at, o.terminal_id, o.cashier_name,
               json_agg(
                 json_build_object(
                   'id',         oi.id,
                   'item_name',  oi.item_name,
                   'quantity',   oi.quantity,
                   'notes',      oi.notes,
                   'done',       COALESCE(oi.done, false)
                 ) ORDER BY oi.item_name
               ) AS items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status = 'active'
        GROUP BY o.id
        ORDER BY o.created_at ASC`
      res.json({ orders })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PATCH /kitchen/items/:itemId/done — mark one item as prepared
  router.patch('/items/:itemId/done', async (req, res) => {
    const { itemId } = req.params
    const { done = true } = req.body || {}
    try {
      // done column added lazily — handle missing column gracefully
      await sql`
        UPDATE order_items SET done = ${done} WHERE id = ${itemId}`

      const [item] = await sql`
        SELECT id, order_id FROM order_items WHERE id = ${itemId}`
      if (item) {
        req.io?.emit('kitchen:item_done', { orderId: item.order_id, itemId, done })
      }
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PATCH /kitchen/orders/:id/done — mark entire order as ready
  router.patch('/orders/:id/done', async (req, res) => {
    const { id } = req.params
    try {
      await sql`UPDATE order_items SET done = true WHERE order_id = ${id}`
      req.io?.emit('order:done', { orderId: id })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
