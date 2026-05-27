'use strict'

const express          = require('express')
const bcrypt           = require('bcryptjs')
const { sign, jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')
const { printKOT }     = require('../lib/printer')

module.exports = function waiterRouter (sql) {
  const router = express.Router()

  // ── Auth ──────────────────────────────────────────────────────────────────

  // GET /waiter/cashiers — public list for login UI (no PINs returned)
  router.get('/cashiers', async (_req, res) => {
    try {
      const cashiers = await sql`
        SELECT id, name, role, 1 AS active FROM cashiers WHERE active = 1 ORDER BY name`
      res.json({ cashiers })
    } catch (e) { serverError(res, e) }
  })

  // POST /waiter/auth — cashier PIN login for waiter app
  router.post('/auth', async (req, res) => {
    const { cashier_id, pin } = req.body || {}
    if (!cashier_id || !pin)
      return res.status(400).json({ error: 'cashier_id and pin required' })

    try {
      const [cashier] = await sql`
        SELECT id, name, pin, role, active FROM cashiers
        WHERE id = ${cashier_id} AND active = 1`

      if (!cashier)
        return res.status(401).json({ error: 'Cashier not found' })

      // Prefer bcrypt hash; fall back to plain-text and migrate lazily
      let pinOk = false
      if (cashier.pin_hash) {
        pinOk = await bcrypt.compare(String(pin), cashier.pin_hash)
      } else {
        pinOk = cashier.pin === String(pin)
        if (pinOk) {
          const hash = await bcrypt.hash(String(pin), 10)
          await sql`UPDATE cashiers SET pin_hash = ${hash} WHERE id = ${cashier.id}`
        }
      }
      if (!pinOk)
        return res.status(401).json({ error: 'Wrong PIN' })

      const token = sign({
        id:   cashier.id,
        name: cashier.name,
        role: cashier.role,
        type: 'cashier',
      })
      res.json({
        ok: true,
        token,
        cashier: { id: cashier.id, name: cashier.name, role: cashier.role },
      })
    } catch (e) { serverError(res, e) }
  })

  // POST /waiter/auth/refresh — re-issue token (called on app resume)
  router.get('/auth/me', jwtAuth, (req, res) => {
    res.json({ ok: true, cashier: req.user })
  })

  // ── Menu ─────────────────────────────────────────────────────────────────

  // GET /waiter/menu — authenticated menu fetch (includes image_url)
  router.get('/menu', jwtAuth, async (req, res) => {
    try {
      const [categories, items] = await Promise.all([
        sql`SELECT id, name, sort_order, color, active FROM categories WHERE active = 1 ORDER BY sort_order, name`,
        sql`SELECT id, category_id, name, price, description, short_description, long_description, image_url, active FROM menu_items WHERE active = 1 ORDER BY name`
      ])
      res.json({ categories, items })
    } catch (e) { serverError(res, e) }
  })

  // GET /waiter/settings — currency + tax_rate for waiter app
  router.get('/settings', jwtAuth, async (req, res) => {
    try {
      const rows = await sql`SELECT key, value FROM settings WHERE key IN ('currency','tax_rate','restaurant_name')`
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
      res.json({ settings: rows, restaurant_name: map.restaurant_name || '' })
    } catch (e) { serverError(res, e) }
  })

  // ── Orders ────────────────────────────────────────────────────────────────

  // GET /waiter/orders — active orders for this cashier
  router.get('/orders', jwtAuth, async (req, res) => {
    const cashierId = req.user.id
    try {
      const orders = await sql`
        SELECT o.id, o.order_number, o.order_type, o.table_id, o.table_name,
               o.customer_name, o.status, o.total, o.created_at,
               json_agg(
                 json_build_object(
                   'id',         oi.id,
                   'item_name',  oi.item_name,
                   'quantity',   oi.quantity,
                   'unit_price', oi.unit_price,
                   'notes',      oi.notes
                 )
               ) AS items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status = 'active' AND o.cashier_id = ${cashierId}
        GROUP BY o.id
        ORDER BY o.created_at DESC`
      res.json({ orders })
    } catch (e) { serverError(res, e) }
  })

  // POST /waiter/orders — create new order from waiter app
  router.post('/orders', jwtAuth, async (req, res) => {
    const cashier = req.user
    const {
      order_type = 'dine-in',
      table_id, table_name,
      customer_name, customer_phone, customer_address,
      items = [],
      notes,
      terminal_id,
      shift_id,
    } = req.body || {}

    if (!items.length)
      return res.status(400).json({ error: 'Order must have at least one item' })

    try {
      const now         = Date.now()
      const orderId     = `ord-${now}-${Math.random().toString(36).slice(2, 7)}`
      const orderNumber = `W${now.toString().slice(-6)}`

      const subtotal = items.reduce((s, i) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)

      // Settings for tax (best-effort)
      let taxRate = 0
      try {
        const [row] = await sql`SELECT value FROM settings WHERE key = 'tax_rate' AND brand_id = ${req.user?.brand_id || ''}`
        taxRate = parseFloat(row?.value || '0')
      } catch (_) {}

      const taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100
      const total     = Math.round((subtotal + taxAmount) * 100) / 100

      await sql.begin(async t => {
        await t`
          INSERT INTO orders (
            id, order_number, order_type, table_id, table_name,
            customer_name, customer_phone, customer_address,
            status, subtotal, tax_rate, tax_amount, total,
            discount_type, discount_value, discount_amount,
            payment_received, change_amount,
            notes, cashier_id, cashier_name, shift_id, terminal_id,
            created_at, updated_at, synced
          ) VALUES (
            ${orderId}, ${orderNumber}, ${order_type}, ${table_id || null}, ${table_name || null},
            ${customer_name || null}, ${customer_phone || null}, ${customer_address || null},
            'active', ${subtotal}, ${taxRate}, ${taxAmount}, ${total},
            'none', 0, 0, 0, 0,
            ${notes || null}, ${cashier.id}, ${cashier.name}, ${shift_id || null}, ${terminal_id || null},
            ${now}, ${now}, 0
          )`

        if (table_id) {
          await t`
            UPDATE tables_layout
            SET status = 'occupied', current_order_id = ${orderId}, locked_by = ${terminal_id || null}
            WHERE id = ${table_id}`
        }

        for (const item of items) {
          const itemId     = `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          const unitPrice  = parseFloat(item.unit_price)
          const qty        = parseInt(item.quantity)
          const totalPrice = Math.round(unitPrice * qty * 100) / 100

          await t`
            INSERT INTO order_items (id, order_id, item_id, item_name, category_name, quantity, unit_price, total_price, notes)
            VALUES (${itemId}, ${orderId}, ${item.item_id}, ${item.item_name}, ${item.category_name || null},
                    ${qty}, ${unitPrice}, ${totalPrice}, ${item.notes || null})`
        }
      })

      const kotData = {
        orderNumber,
        orderType: order_type,
        tableName: table_name || null,
        customerName: customer_name || null,
        cashierName: cashier.name,
        createdAt: now,
        items,
        area: 'kitchen',
      }

      // Broadcast new order to KDS + all terminals
      req.io?.emit('order:created', {
        orderId,
        orderNumber,
        tableId: table_id || null,
        tableName: table_name || null,
        orderType: order_type,
        items,
        terminal_id,
        cashierName: cashier.name,
        createdAt: now,
      })

      // Update table status for waiter app map
      if (table_id) {
        req.io?.emit('table:status', { tableId: table_id, status: 'occupied', locked_by: terminal_id || null })
      }

      // Print KOT — network printer if configured, else Socket.io fallback
      printKOT(sql, req.io, kotData).catch(() => {})

      res.status(201).json({ ok: true, orderId, orderNumber })
    } catch (e) { serverError(res, e) }
  })

  // PATCH /waiter/orders/:id/items — replace items on an active order
  router.patch('/orders/:id/items', jwtAuth, async (req, res) => {
    const { id } = req.params
    const { items = [] } = req.body || {}

    try {
      const [order] = await sql`SELECT id, status FROM orders WHERE id = ${id}`
      if (!order)         return res.status(404).json({ error: 'Order not found' })
      if (order.status !== 'active')
        return res.status(409).json({ error: 'Order is not active' })

      const subtotal = items.reduce((s, i) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)
      let taxRate = 0
      try {
        const [row] = await sql`SELECT value FROM settings WHERE key = 'tax_rate' AND brand_id = ${req.user?.brand_id || ''}`
        taxRate = parseFloat(row?.value || '0')
      } catch (_) {}
      const taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100
      const total     = Math.round((subtotal + taxAmount) * 100) / 100
      const now       = Date.now()

      await sql.begin(async t => {
        await t`DELETE FROM order_items WHERE order_id = ${id}`
        await t`UPDATE orders SET subtotal=${subtotal}, tax_amount=${taxAmount}, total=${total}, updated_at=${now} WHERE id=${id}`

        for (const item of items) {
          const itemId    = `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          const unitPrice = parseFloat(item.unit_price)
          const qty       = parseInt(item.quantity)
          await t`
            INSERT INTO order_items (id, order_id, item_id, item_name, category_name, quantity, unit_price, total_price, notes)
            VALUES (${itemId}, ${id}, ${item.item_id}, ${item.item_name}, ${item.category_name || null},
                    ${qty}, ${unitPrice}, ${Math.round(unitPrice*qty*100)/100}, ${item.notes || null})`
        }
      })

      req.io?.emit('order:updated', { orderId: id, items })
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  return router
}
