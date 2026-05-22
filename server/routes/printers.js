'use strict'

const express = require('express')

module.exports = function printersRouter (sql) {
  const router = express.Router()

  const COLS = ['id', 'name', 'type', 'ip', 'port', 'area', 'active']
  function pick (obj) {
    const r = {}
    for (const c of COLS) if (obj[c] !== undefined) r[c] = obj[c]
    return r
  }

  // GET /printers
  router.get('/', async (_req, res) => {
    try {
      const printers = await sql`SELECT * FROM printers ORDER BY area, name`
      res.json({ printers })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // POST /printers
  router.post('/', async (req, res) => {
    const data = pick(req.body || {})
    if (!data.id) data.id = `printer-${Date.now()}`
    if (!data.name) return res.status(400).json({ error: 'name required' })
    try {
      const [printer] = await sql`INSERT INTO printers ${sql(data)} RETURNING *`
      res.status(201).json({ printer })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT /printers/:id
  router.put('/:id', async (req, res) => {
    const data = pick(req.body || {})
    delete data.id
    if (Object.keys(data).length === 0)
      return res.status(400).json({ error: 'No fields to update' })
    try {
      const [printer] = await sql`
        UPDATE printers SET ${sql(data)} WHERE id = ${req.params.id} RETURNING *`
      if (!printer) return res.status(404).json({ error: 'Not found' })
      res.json({ printer })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // DELETE /printers/:id
  router.delete('/:id', async (req, res) => {
    try {
      await sql`DELETE FROM printers WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
