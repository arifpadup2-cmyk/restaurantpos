'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function menuRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  function uid () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

  // GET /menu — categories + items
  router.get('/', async (_req, res) => {
    try {
      const [categories, items] = await Promise.all([
        sql`SELECT * FROM categories ORDER BY sort_order, name`,
        sql`SELECT * FROM menu_items ORDER BY name`,
      ])
      res.json({ categories, items })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // POST /menu/categories
  router.post('/categories', async (req, res) => {
    const { name, color, sort_order } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const id = uid()
      const row = await sql`
        INSERT INTO categories (id, name, color, sort_order, active, synced_at)
        VALUES (${id}, ${name}, ${color || '#f97316'}, ${sort_order || 0}, 1, ${Date.now()})
        RETURNING *`
      res.json({ ok: true, category: row[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT /menu/categories/:id
  router.put('/categories/:id', async (req, res) => {
    const { name, color, sort_order, active } = req.body || {}
    try {
      const row = await sql`
        UPDATE categories SET
          name       = COALESCE(${name ?? null}, name),
          color      = COALESCE(${color ?? null}, color),
          sort_order = COALESCE(${sort_order ?? null}, sort_order),
          active     = COALESCE(${active ?? null}, active),
          synced_at  = ${Date.now()}
        WHERE id = ${req.params.id}
        RETURNING *`
      if (!row.length) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, category: row[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // DELETE /menu/categories/:id
  router.delete('/categories/:id', async (req, res) => {
    try {
      await sql`DELETE FROM categories WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // POST /menu/items
  router.post('/items', async (req, res) => {
    const { name, price, category_id, description, item_code } = req.body || {}
    if (!name || !price || !category_id) return res.status(400).json({ error: 'name, price, category_id required' })
    try {
      const id  = uid()
      const row = await sql`
        INSERT INTO menu_items (id, category_id, name, price, description, item_code, active, synced_at)
        VALUES (${id}, ${category_id}, ${name}, ${price}, ${description || ''}, ${item_code || null}, 1, ${Date.now()})
        RETURNING *`
      res.json({ ok: true, item: row[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT /menu/items/:id
  router.put('/items/:id', async (req, res) => {
    const { name, price, category_id, description, active, item_code } = req.body || {}
    try {
      const row = await sql`
        UPDATE menu_items SET
          name        = COALESCE(${name ?? null}, name),
          price       = COALESCE(${price ?? null}, price),
          category_id = COALESCE(${category_id ?? null}, category_id),
          description = COALESCE(${description ?? null}, description),
          item_code   = CASE WHEN ${item_code !== undefined} THEN ${item_code ?? null} ELSE item_code END,
          active      = COALESCE(${active ?? null}, active),
          synced_at   = ${Date.now()}
        WHERE id = ${req.params.id}
        RETURNING *`
      if (!row.length) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, item: row[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // DELETE /menu/items/:id
  router.delete('/items/:id', async (req, res) => {
    try {
      await sql`DELETE FROM menu_items WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
