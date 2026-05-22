'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function staffRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  function uid () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

  // GET /staff/cashiers
  router.get('/cashiers', async (_req, res) => {
    try {
      const cashiers = await sql`SELECT * FROM cashiers ORDER BY name`
      res.json({ cashiers })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // POST /staff/cashiers
  router.post('/cashiers', async (req, res) => {
    const { name, pin, role } = req.body || {}
    if (!name || !pin) return res.status(400).json({ error: 'name and pin required' })
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be 4 digits' })
    try {
      const id  = uid()
      const rid = req.user?.restaurant_id || null
      const row = await sql`
        INSERT INTO cashiers (id, name, pin, role, active, created_at, restaurant_id)
        VALUES (${id}, ${name}, ${pin}, ${role || 'cashier'}, 1, ${Date.now()}, ${rid})
        RETURNING *`
      res.json({ ok: true, cashier: row[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT /staff/cashiers/:id
  router.put('/cashiers/:id', async (req, res) => {
    const { name, pin, role, active } = req.body || {}
    if (pin && !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be 4 digits' })
    try {
      const row = await sql`
        UPDATE cashiers SET
          name   = COALESCE(${name ?? null}, name),
          pin    = COALESCE(${pin ?? null}, pin),
          role   = COALESCE(${role ?? null}, role),
          active = COALESCE(${active ?? null}, active)
        WHERE id = ${req.params.id}
        RETURNING *`
      if (!row.length) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, cashier: row[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
