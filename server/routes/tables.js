'use strict'

const express = require('express')

module.exports = function tablesRouter (sql) {
  const router = express.Router()

  // GET /tables — all tables with status (waiter app table map)
  router.get('/', async (req, res) => {
    try {
      const tables = await sql`
        SELECT id, name, capacity, status, current_order_id, locked_by
        FROM tables_layout ORDER BY name`
      res.json({ tables })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // POST /tables/:id/lock — waiter app claims a table before building order
  // Body: { terminal_id }
  router.post('/:id/lock', async (req, res) => {
    const { id } = req.params
    const { terminal_id } = req.body || {}
    if (!terminal_id) return res.status(400).json({ error: 'terminal_id required' })

    try {
      const result = await sql`
        UPDATE tables_layout
        SET locked_by = ${terminal_id}
        WHERE id = ${id}
          AND (locked_by IS NULL OR locked_by = ${terminal_id} OR status = 'available')
        RETURNING id, name, status, locked_by`

      if (result.length === 0)
        return res.status(409).json({ error: 'Table locked by another terminal' })

      req.io?.emit('table:status', {
        tableId: result[0].id,
        status: result[0].status,
        locked_by: result[0].locked_by,
      })
      res.json({ ok: true, table: result[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // DELETE /tables/:id/lock — release table lock
  // Body: { terminal_id }
  router.delete('/:id/lock', async (req, res) => {
    const { id } = req.params
    const { terminal_id } = req.body || {}

    try {
      await sql`
        UPDATE tables_layout
        SET locked_by = NULL
        WHERE id = ${id}
          AND (locked_by = ${terminal_id} OR ${terminal_id} IS NULL)`

      req.io?.emit('table:status', { tableId: id, locked_by: null })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
