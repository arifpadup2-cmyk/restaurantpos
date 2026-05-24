'use strict'

const express = require('express')
const { apiKey, requireTenantTerminal } = require('../middleware/apiKey')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

module.exports = function tablesRouter (sql) {
  const router = express.Router()

  // ── Scope helper ───────────────────────────────────────────────────────────
  // Tables routes are called by:
  //   1. POS / Waiter Electron terminals (per-terminal API key) → use req.terminal
  //   2. Back office UI (JWT) → use req.user.brand_id (+ optional ?outlet_id=)
  // Both code paths derive brand_id from the principal, never from the request.

  // GET /tables — list tables for caller's outlet
  router.get('/', async (req, res, next) => {
    // Allow either auth method
    if (req.headers['authorization']) return jwtAuth(req, res, next)
    return apiKey(req, res, next)
  }, async (req, res) => {
    try {
      let brand_id, outlet_id
      if (req.terminal) {
        brand_id  = req.terminal.brand_id
        outlet_id = req.terminal.outlet_id
      } else {
        brand_id  = req.user?.brand_id || ''
        outlet_id = req.query.outlet_id || null
        if (outlet_id) {
          const [owned] = await sql`SELECT id FROM outlets WHERE id = ${outlet_id} AND brand_id = ${brand_id}`
          if (!owned) return res.status(403).json({ error: 'Outlet not in your brand' })
        }
      }

      const tables = outlet_id
        ? await sql`
            SELECT id, name, capacity, status, current_order_id, locked_by, outlet_id, section_id
            FROM tables_layout
            WHERE brand_id = ${brand_id} AND outlet_id = ${outlet_id}
            ORDER BY name`
        : await sql`
            SELECT id, name, capacity, status, current_order_id, locked_by, outlet_id, section_id
            FROM tables_layout
            WHERE brand_id = ${brand_id}
            ORDER BY name`
      res.json({ tables })
    } catch (e) { serverError(res, e) }
  })

  // POST /tables/:id/lock — waiter app claims a table
  router.post('/:id/lock', apiKey, requireTenantTerminal, async (req, res) => {
    const { id } = req.params
    const { terminal_id } = req.body || {}
    if (!terminal_id) return res.status(400).json({ error: 'terminal_id required' })

    try {
      // Verify table belongs to terminal's brand+outlet before locking
      const [tbl] = await sql`
        SELECT id, brand_id, outlet_id
        FROM tables_layout
        WHERE id = ${id} AND brand_id = ${req.terminal.brand_id}`
      if (!tbl) return res.status(404).json({ error: 'Table not found' })
      if (req.terminal.outlet_id && tbl.outlet_id && tbl.outlet_id !== req.terminal.outlet_id)
        return res.status(403).json({ error: 'Table belongs to another outlet' })

      const result = await sql`
        UPDATE tables_layout
        SET locked_by = ${terminal_id}
        WHERE id = ${id}
          AND brand_id = ${req.terminal.brand_id}
          AND (locked_by IS NULL OR locked_by = ${terminal_id} OR status = 'available')
        RETURNING id, name, status, locked_by`

      if (result.length === 0)
        return res.status(409).json({ error: 'Table locked by another terminal' })

      req.io?.to('rest:' + req.terminal.brand_id).emit('table:status', {
        tableId:    result[0].id,
        status:     result[0].status,
        locked_by:  result[0].locked_by,
      })
      res.json({ ok: true, table: result[0] })
    } catch (e) { serverError(res, e) }
  })

  // DELETE /tables/:id/lock — release table lock
  router.delete('/:id/lock', apiKey, requireTenantTerminal, async (req, res) => {
    const { id } = req.params
    const { terminal_id } = req.body || {}
    if (!terminal_id) return res.status(400).json({ error: 'terminal_id required' })

    try {
      await sql`
        UPDATE tables_layout
        SET locked_by = NULL
        WHERE id = ${id}
          AND brand_id = ${req.terminal.brand_id}
          AND locked_by = ${terminal_id}`

      req.io?.to('rest:' + req.terminal.brand_id).emit('table:status', {
        tableId: id, locked_by: null,
      })
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  return router
}
