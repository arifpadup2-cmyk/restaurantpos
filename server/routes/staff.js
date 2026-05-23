'use strict'

const express = require('express')
const bcrypt  = require('bcryptjs')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function staffRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  function uid () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

  // Strip sensitive fields from cashier rows before sending to client
  function safeCashier (row) {
    const { pin, pin_hash, ...safe } = row
    return safe
  }

  // GET /staff/cashiers
  router.get('/cashiers', async (req, res) => {
    const rid = req.user?.restaurant_id || null
    try {
      const cashiers = rid
        ? await sql`SELECT * FROM cashiers WHERE restaurant_id = ${rid} ORDER BY name`
        : await sql`SELECT * FROM cashiers WHERE restaurant_id IS NULL ORDER BY name`
      res.json({ cashiers: cashiers.map(safeCashier) })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // POST /staff/cashiers
  router.post('/cashiers', async (req, res) => {
    const { name, pin, role } = req.body || {}
    if (!name || !pin) return res.status(400).json({ error: 'name and pin required' })
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be 4 digits' })
    try {
      const id      = uid()
      const rid     = req.user?.restaurant_id || null
      const pinHash = await bcrypt.hash(pin, 10)
      const [row]   = await sql`
        INSERT INTO cashiers (id, name, pin, pin_hash, role, active, created_at, restaurant_id)
        VALUES (${id}, ${name}, ${pin}, ${pinHash}, ${role || 'cashier'}, 1, ${Date.now()}, ${rid})
        RETURNING *`
      res.json({ ok: true, cashier: safeCashier(row) })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT /staff/cashiers/:id
  router.put('/cashiers/:id', async (req, res) => {
    const { name, pin, role, active } = req.body || {}
    if (pin && !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be 4 digits' })
    const rid = req.user?.restaurant_id || null
    try {
      const pinHash = pin ? await bcrypt.hash(pin, 10) : null
      const [row]   = await sql`
        UPDATE cashiers SET
          name     = COALESCE(${name ?? null}, name),
          pin      = COALESCE(${pin ?? null}, pin),
          pin_hash = COALESCE(${pinHash}, pin_hash),
          role     = COALESCE(${role ?? null}, role),
          active   = COALESCE(${active ?? null}, active)
        WHERE id = ${req.params.id}
          AND (restaurant_id = ${rid} OR (${rid} IS NULL AND restaurant_id IS NULL))
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, cashier: safeCashier(row) })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
