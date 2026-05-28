'use strict'

const express = require('express')
const { randomUUID } = require('crypto')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

module.exports = function announcementsRouter (sql) {
  const router = express.Router()

  // GET /announcements — public, no auth (shown on POS login screen)
  router.get('/', async (_req, res) => {
    try {
      const rows = await sql`
        SELECT id, title, description, badge_text, accent_color, sort_order
        FROM   announcements
        WHERE  is_active = true
        ORDER  BY sort_order, created_at`
      res.json({ announcements: rows })
    } catch (e) { serverError(res, e) }
  })

  // GET /announcements/admin — list all (superadmin panel)
  router.get('/admin', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`SELECT * FROM announcements ORDER BY sort_order, created_at`
      res.json({ announcements: rows })
    } catch (e) { serverError(res, e) }
  })

  // POST /announcements/admin — create
  router.post('/admin', jwtAuth, async (req, res) => {
    const { title, description = '', badge_text = 'New', accent_color = '#f97316', sort_order = 0 } = req.body || {}
    if (!title?.trim()) return res.status(400).json({ error: 'title required' })
    try {
      const id = randomUUID().replace(/-/g, '').slice(0, 20)
      const [row] = await sql`
        INSERT INTO announcements (id, title, description, badge_text, accent_color, sort_order)
        VALUES (${id}, ${title.trim()}, ${description}, ${badge_text}, ${accent_color}, ${sort_order})
        RETURNING *`
      res.status(201).json({ announcement: row })
    } catch (e) { serverError(res, e) }
  })

  // PUT /announcements/admin/:id — update
  router.put('/admin/:id', jwtAuth, async (req, res) => {
    const { id } = req.params
    const { title, description, badge_text, accent_color, sort_order, is_active } = req.body || {}
    try {
      const [row] = await sql`
        UPDATE announcements SET
          title        = COALESCE(${title ?? null}, title),
          description  = COALESCE(${description ?? null}, description),
          badge_text   = COALESCE(${badge_text ?? null}, badge_text),
          accent_color = COALESCE(${accent_color ?? null}, accent_color),
          sort_order   = COALESCE(${sort_order ?? null}, sort_order),
          is_active    = COALESCE(${is_active ?? null}, is_active),
          updated_at   = now()
        WHERE id = ${id}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'Not found' })
      res.json({ announcement: row })
    } catch (e) { serverError(res, e) }
  })

  // DELETE /announcements/admin/:id — delete
  router.delete('/admin/:id', jwtAuth, async (req, res) => {
    const { id } = req.params
    try {
      await sql`DELETE FROM announcements WHERE id = ${id}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  return router
}
