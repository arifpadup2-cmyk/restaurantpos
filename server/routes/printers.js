'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

module.exports = function printersRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  const COLS = ['id', 'name', 'type', 'ip', 'port', 'area', 'active', 'brand_id']
  function pick (obj) {
    const r = {}
    for (const c of COLS) if (obj[c] !== undefined) r[c] = obj[c]
    return r
  }

  // GET /printers
  router.get('/', async (req, res) => {
    const rid = req.user?.brand_id || null
    try {
      const printers = rid
        ? await sql`SELECT * FROM printers WHERE brand_id = ${rid} ORDER BY area, name`
        : await sql`SELECT * FROM printers ORDER BY area, name`
      res.json({ printers })
    } catch (e) { serverError(res, e) }
  })

  // POST /printers
  router.post('/', async (req, res) => {
    const data = pick(req.body || {})
    if (!data.id) data.id = `printer-${Date.now()}`
    if (!data.name) return res.status(400).json({ error: 'name required' })
    data.brand_id = req.user?.brand_id || null
    try {
      const [printer] = await sql`INSERT INTO printers ${sql(data)} RETURNING *`
      res.status(201).json({ printer })
    } catch (e) { serverError(res, e) }
  })

  // PUT /printers/:id
  router.put('/:id', async (req, res) => {
    const rid  = req.user?.brand_id || null
    const data = pick(req.body || {})
    delete data.id
    delete data.brand_id
    if (Object.keys(data).length === 0)
      return res.status(400).json({ error: 'No fields to update' })
    try {
      const [printer] = rid
        ? await sql`UPDATE printers SET ${sql(data)} WHERE id = ${req.params.id} AND brand_id = ${rid} RETURNING *`
        : await sql`UPDATE printers SET ${sql(data)} WHERE id = ${req.params.id} RETURNING *`
      if (!printer) return res.status(404).json({ error: 'Not found' })
      res.json({ printer })
    } catch (e) { serverError(res, e) }
  })

  // DELETE /printers/:id
  router.delete('/:id', async (req, res) => {
    const rid = req.user?.brand_id || null
    try {
      if (rid) await sql`DELETE FROM printers WHERE id = ${req.params.id} AND brand_id = ${rid}`
      else     await sql`DELETE FROM printers WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  return router
}
