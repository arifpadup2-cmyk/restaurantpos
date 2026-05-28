'use strict'

const express          = require('express')
const bcrypt           = require('bcryptjs')
const { sign, jwtAuth } = require('../middleware/jwtAuth')
const { serverError }  = require('../middleware/serverError')

module.exports = function deliveryRouter (sql) {
  const router = express.Router()

  // ── Auth ──────────────────────────────────────────────────────────────────

  // GET /delivery/boys — public list of delivery staff for login screen
  router.get('/boys', async (req, res) => {
    try {
      const brandId  = req.query.brand_id  || null
      const outletId = req.query.outlet_id || null
      // Validate outlet belongs to brand before returning staff list
      if (brandId && outletId) {
        const [owned] = await sql`SELECT id FROM outlets WHERE id = ${outletId} AND brand_id = ${brandId}`
        if (!owned) return res.status(403).json({ error: 'Outlet not in this brand', boys: [] })
      }
      const boys = brandId && outletId
        ? await sql`
            SELECT id, name, role FROM cashiers
            WHERE active = 1 AND role = 'delivery'
              AND brand_id = ${brandId}
              AND (outlet_id = ${outletId} OR outlet_id IS NULL)
            ORDER BY name`
        : brandId
        ? await sql`
            SELECT id, name, role FROM cashiers
            WHERE active = 1 AND role = 'delivery' AND brand_id = ${brandId}
            ORDER BY name`
        : await sql`
            SELECT id, name, role FROM cashiers
            WHERE active = 1 AND role = 'delivery'
            ORDER BY name`
      res.json({ boys })
    } catch (e) { serverError(res, e) }
  })

  // GET /delivery/outlets — public outlet list (brand_id required for isolation)
  router.get('/outlets', async (req, res) => {
    try {
      const brandId = req.query.brand_id || null
      if (!brandId) return res.json({ outlets: [] })
      const outlets = await sql`SELECT id, name FROM outlets WHERE brand_id = ${brandId} ORDER BY name`
      res.json({ outlets })
    } catch (e) { serverError(res, e) }
  })

  // POST /delivery/auth — PIN login
  router.post('/auth', async (req, res) => {
    const { boy_id, pin, brand_id, outlet_id } = req.body || {}
    if (!boy_id || !pin)
      return res.status(400).json({ error: 'boy_id and pin required' })
    try {
      const [boy] = await sql`
        SELECT id, name, pin, pin_hash, role, active, brand_id, outlet_id FROM cashiers
        WHERE id = ${boy_id} AND active = 1`
      if (!boy)
        return res.status(401).json({ error: 'Staff not found' })
      if (boy.role !== 'delivery')
        return res.status(403).json({ error: 'This role cannot access the delivery app' })

      // Validate delivery staff belongs to the device's brand
      if (brand_id && boy.brand_id && boy.brand_id !== brand_id)
        return res.status(403).json({ error: 'Staff not registered to this brand' })

      // Validate outlet — staff must be unassigned OR assigned to this outlet
      if (outlet_id && boy.outlet_id && boy.outlet_id !== outlet_id)
        return res.status(403).json({ error: 'Staff not assigned to this outlet' })

      let pinOk = false
      if (boy.pin_hash) {
        pinOk = await bcrypt.compare(String(pin), boy.pin_hash)
      } else {
        pinOk = boy.pin === String(pin)
        if (pinOk) {
          const hash = await bcrypt.hash(String(pin), 10)
          await sql`UPDATE cashiers SET pin_hash = ${hash} WHERE id = ${boy.id}`
        }
      }
      if (!pinOk) return res.status(401).json({ error: 'Wrong PIN' })

      const token = sign({
        id:        boy.id,
        name:      boy.name,
        role:      boy.role,
        type:      'cashier',
        brand_id:  boy.brand_id  || null,
        outlet_id: boy.outlet_id || null,
      })
      res.json({ ok: true, token, boy: { id: boy.id, name: boy.name, role: boy.role } })
    } catch (e) { serverError(res, e) }
  })

  // GET /delivery/auth/me
  router.get('/auth/me', jwtAuth, (req, res) => {
    res.json({ ok: true, boy: req.user })
  })

  // ── Orders ────────────────────────────────────────────────────────────────

  // GET /delivery/orders — all active delivery orders for this outlet/brand
  router.get('/orders', jwtAuth, async (req, res) => {
    const boy = req.user
    const brandId  = boy.brand_id  || null
    const outletId = boy.outlet_id || null
    try {
      const orders = outletId
        ? await sql`
            SELECT o.id, o.order_number, o.order_type,
                   o.customer_name, o.customer_phone, o.customer_address,
                   o.total, o.payment_method, o.notes,
                   o.delivery_boy_id, o.delivery_boy_name,
                   COALESCE(o.delivery_status, 'pending') AS delivery_status,
                   o.delivery_assigned_at, o.delivery_picked_up_at, o.delivery_delivered_at,
                   o.created_at, o.outlet_id, o.brand_id,
                   json_agg(
                     json_build_object(
                       'item_name', oi.item_name,
                       'quantity',  oi.quantity,
                       'notes',     oi.notes
                     ) ORDER BY oi.item_name
                   ) AS items
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.status = 'active'
              AND o.order_type IN ('delivery', 'online')
              AND COALESCE(o.delivery_status, 'pending') NOT IN ('delivered', 'cancelled')
              AND o.brand_id  = ${brandId}
              AND o.outlet_id = ${outletId}
            GROUP BY o.id
            ORDER BY o.created_at ASC`
        : await sql`
            SELECT o.id, o.order_number, o.order_type,
                   o.customer_name, o.customer_phone, o.customer_address,
                   o.total, o.payment_method, o.notes,
                   o.delivery_boy_id, o.delivery_boy_name,
                   COALESCE(o.delivery_status, 'pending') AS delivery_status,
                   o.delivery_assigned_at, o.delivery_picked_up_at, o.delivery_delivered_at,
                   o.created_at, o.outlet_id, o.brand_id,
                   json_agg(
                     json_build_object(
                       'item_name', oi.item_name,
                       'quantity',  oi.quantity,
                       'notes',     oi.notes
                     ) ORDER BY oi.item_name
                   ) AS items
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.status = 'active'
              AND o.order_type IN ('delivery', 'online')
              AND COALESCE(o.delivery_status, 'pending') NOT IN ('delivered', 'cancelled')
              AND o.brand_id = ${brandId}
            GROUP BY o.id
            ORDER BY o.created_at ASC`
      res.json({ orders })
    } catch (e) { serverError(res, e) }
  })

  // POST /delivery/orders/:id/claim — claim an unassigned delivery order
  router.post('/orders/:id/claim', jwtAuth, async (req, res) => {
    const { id } = req.params
    const boy    = req.user
    try {
      const [order] = await sql`
        SELECT id, delivery_boy_id, brand_id, outlet_id, status FROM orders WHERE id = ${id}`
      if (!order)
        return res.status(404).json({ error: 'Order not found' })
      // Verify order belongs to this delivery boy's brand + outlet
      if (boy.brand_id  && order.brand_id  && order.brand_id  !== boy.brand_id)
        return res.status(403).json({ error: 'Order not in your brand' })
      if (boy.outlet_id && order.outlet_id && order.outlet_id !== boy.outlet_id)
        return res.status(403).json({ error: 'Order belongs to another outlet' })
      if (order.status !== 'active')
        return res.status(409).json({ error: 'Order is not active' })
      if (order.delivery_boy_id)
        return res.status(409).json({ error: 'Order already claimed' })

      const now = Date.now()
      await sql`
        UPDATE orders
        SET delivery_boy_id     = ${boy.id},
            delivery_boy_name   = ${boy.name},
            delivery_status     = 'assigned',
            delivery_assigned_at = ${now},
            updated_at          = ${now}
        WHERE id = ${id}`

      req.io?.to('rest:' + order.brand_id).emit('delivery:claimed', {
        orderId: id, boyId: boy.id, boyName: boy.name
      })
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // PATCH /delivery/orders/:id/status — update delivery status
  router.patch('/orders/:id/status', jwtAuth, async (req, res) => {
    const { id }     = req.params
    const { status } = req.body || {}
    const valid = ['pending', 'assigned', 'picked_up', 'delivered', 'cancelled']
    if (!valid.includes(status))
      return res.status(400).json({ error: 'Invalid status' })
    try {
      const boy = req.user
      const [order] = await sql`
        SELECT id, delivery_boy_id, brand_id, outlet_id, status FROM orders WHERE id = ${id}`
      if (!order)
        return res.status(404).json({ error: 'Order not found' })
      // Verify order belongs to this delivery boy's brand + outlet
      if (boy.brand_id  && order.brand_id  && order.brand_id  !== boy.brand_id)
        return res.status(403).json({ error: 'Order not in your brand' })
      if (boy.outlet_id && order.outlet_id && order.outlet_id !== boy.outlet_id)
        return res.status(403).json({ error: 'Order belongs to another outlet' })
      if (order.delivery_boy_id && order.delivery_boy_id !== req.user.id)
        return res.status(403).json({ error: 'Order assigned to another delivery staff' })

      const now = Date.now()
      if (status === 'picked_up') {
        await sql`UPDATE orders SET delivery_status=${status}, delivery_picked_up_at=${now}, updated_at=${now} WHERE id=${id}`
      } else if (status === 'delivered') {
        await sql`UPDATE orders SET delivery_status=${status}, delivery_delivered_at=${now}, updated_at=${now} WHERE id=${id}`
      } else if (status === 'assigned') {
        await sql`UPDATE orders SET delivery_status=${status}, delivery_assigned_at=${now}, updated_at=${now} WHERE id=${id}`
      } else {
        await sql`UPDATE orders SET delivery_status=${status}, updated_at=${now} WHERE id=${id}`
      }

      req.io?.to('rest:' + order.brand_id).emit('delivery:status', {
        orderId: id, status, boyId: req.user.id
      })
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  return router
}
