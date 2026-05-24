'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')
const { apiKey, requireTenantTerminal }  = require('../middleware/apiKey')
const { serverError } = require('../middleware/serverError')

module.exports = function customersRouter (sql) {
  const router = express.Router()

  // GET /customers?q=  — back-office search, scoped to caller's brand
  router.get('/', jwtAuth, async (req, res) => {
    const rid = req.user.brand_id || ''
    try {
      const q = `%${req.query.q || ''}%`
      const rows = await sql`
        SELECT * FROM customers
        WHERE brand_id = ${rid}
          AND (name ILIKE ${q} OR phone ILIKE ${q})
        ORDER BY name LIMIT 50`
      res.json(rows)
    } catch (e) { serverError(res, e) }
  })

  // GET /customers/:id — back-office, scoped to caller's brand
  router.get('/:id', jwtAuth, async (req, res) => {
    const rid = req.user.brand_id || ''
    try {
      const [row] = await sql`
        SELECT * FROM customers
        WHERE id = ${req.params.id} AND brand_id = ${rid}`
      if (!row) return res.status(404).json({ error: 'Not found' })
      res.json(row)
    } catch (e) { serverError(res, e) }
  })

  // POST /customers — back-office create/update, brand-scoped
  router.post('/', jwtAuth, async (req, res) => {
    const { id, name, phone, email, notes } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    const rid = req.user.brand_id || null
    try {
      const now   = Date.now()
      const newId = id || require('crypto').randomUUID()
      const [row] = await sql`
        INSERT INTO customers (id, name, phone, email, notes, created_at, updated_at, brand_id)
        VALUES (${newId}, ${name}, ${phone || null}, ${email || null}, ${notes || null}, ${now}, ${now}, ${rid})
        ON CONFLICT (id) DO UPDATE SET
          name       = EXCLUDED.name,
          phone      = EXCLUDED.phone,
          email      = EXCLUDED.email,
          notes      = EXCLUDED.notes,
          updated_at = EXCLUDED.updated_at
        WHERE customers.brand_id = EXCLUDED.brand_id
        RETURNING *`
      if (!row) return res.status(403).json({ error: 'Customer belongs to another brand' })
      res.json(row)
    } catch (e) { serverError(res, e) }
  })

  // PATCH /customers/:id/loyalty — POS terminal (per-terminal API key required).
  // brand_id is derived from the terminal, never accepted from the request body.
  router.patch('/:id/loyalty', apiKey, requireTenantTerminal, async (req, res) => {
    const { delta = 0, spent = 0 } = req.body || {}
    const brand_id = req.terminal.brand_id
    try {
      const [row] = await sql`
        UPDATE customers SET
          loyalty_points = loyalty_points + ${delta},
          total_spent    = total_spent    + ${spent},
          visit_count    = visit_count    + ${spent > 0 ? 1 : 0},
          updated_at     = ${Date.now()}
        WHERE id = ${req.params.id} AND brand_id = ${brand_id}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'Customer not found' })
      res.json(row)
    } catch (e) { serverError(res, e) }
  })

  // POST /customers/sync — POS terminal bulk upsert (per-terminal API key).
  // brand_id is derived from the terminal — body brand_id is ignored.
  router.post('/sync', apiKey, requireTenantTerminal, async (req, res) => {
    const brand_id = req.terminal.brand_id
    const rows = req.body
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ ok: true })
    try {
      for (const r of rows) {
        await sql`
          INSERT INTO customers (id, name, phone, email, loyalty_points, total_spent,
                                 visit_count, notes, created_at, updated_at, brand_id, outlet_id)
          VALUES (${r.id}, ${r.name}, ${r.phone || null}, ${r.email || null},
                  ${r.loyalty_points || 0}, ${r.total_spent || 0},
                  ${r.visit_count || 0}, ${r.notes || null}, ${r.created_at}, ${r.updated_at},
                  ${brand_id}, ${req.terminal.outlet_id || null})
          ON CONFLICT (id) DO UPDATE SET
            name           = EXCLUDED.name,
            phone          = EXCLUDED.phone,
            email          = EXCLUDED.email,
            loyalty_points = GREATEST(customers.loyalty_points, EXCLUDED.loyalty_points),
            total_spent    = GREATEST(customers.total_spent,    EXCLUDED.total_spent),
            visit_count    = GREATEST(customers.visit_count,    EXCLUDED.visit_count),
            notes          = EXCLUDED.notes,
            updated_at     = EXCLUDED.updated_at
          WHERE customers.brand_id = EXCLUDED.brand_id
        `
      }
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  return router
}
