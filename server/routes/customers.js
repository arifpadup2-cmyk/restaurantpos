'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function customersRouter (sql) {
  const router = express.Router()

  // GET /customers?q=  (search by name or phone)
  router.get('/', async (req, res) => {
    try {
      const q = `%${req.query.q || ''}%`
      const rows = await sql`
        SELECT * FROM customers
        WHERE name ILIKE ${q} OR phone ILIKE ${q}
        ORDER BY name LIMIT 50`
      res.json(rows)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // GET /customers/:id
  router.get('/:id', async (req, res) => {
    try {
      const [row] = await sql`SELECT * FROM customers WHERE id = ${req.params.id}`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json(row)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // POST /customers  (back office — create/update)
  router.post('/', jwtAuth, async (req, res) => {
    const { id, name, phone, email, notes } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const now = Date.now()
      const newId = id || require('crypto').randomUUID()
      const rid = req.user?.brand_id || null
      const [row] = await sql`
        INSERT INTO customers (id, name, phone, email, notes, created_at, updated_at, brand_id)
        VALUES (${newId}, ${name}, ${phone || null}, ${email || null}, ${notes || null}, ${now}, ${now}, ${rid})
        ON CONFLICT (id) DO UPDATE SET
          name       = EXCLUDED.name,
          phone      = EXCLUDED.phone,
          email      = EXCLUDED.email,
          notes      = EXCLUDED.notes,
          updated_at = EXCLUDED.updated_at
        RETURNING *`
      res.json(row)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // PATCH /customers/:id/loyalty
  router.patch('/:id/loyalty', async (req, res) => {
    const { delta = 0, spent = 0 } = req.body
    try {
      const [row] = await sql`
        UPDATE customers SET
          loyalty_points = loyalty_points + ${delta},
          total_spent    = total_spent    + ${spent},
          visit_count    = visit_count    + ${spent > 0 ? 1 : 0},
          updated_at     = ${Date.now()}
        WHERE id = ${req.params.id}
        RETURNING *`
      res.json(row)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // POST /customers/sync — bulk upsert from Electron terminal
  router.post('/sync', async (req, res) => {
    const rows = req.body
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ ok: true })
    try {
      for (const r of rows) {
        await sql`
          INSERT INTO customers (id, name, phone, email, loyalty_points, total_spent,
                                 visit_count, notes, created_at, updated_at)
          VALUES (${r.id}, ${r.name}, ${r.phone || null}, ${r.email || null},
                  ${r.loyalty_points || 0}, ${r.total_spent || 0},
                  ${r.visit_count || 0}, ${r.notes || null}, ${r.created_at}, ${r.updated_at})
          ON CONFLICT (id) DO UPDATE SET
            name           = EXCLUDED.name,
            phone          = EXCLUDED.phone,
            email          = EXCLUDED.email,
            loyalty_points = GREATEST(customers.loyalty_points, EXCLUDED.loyalty_points),
            total_spent    = GREATEST(customers.total_spent,    EXCLUDED.total_spent),
            visit_count    = GREATEST(customers.visit_count,    EXCLUDED.visit_count),
            notes          = EXCLUDED.notes,
            updated_at     = EXCLUDED.updated_at
        `
      }
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  return router
}
