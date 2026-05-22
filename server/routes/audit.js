'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function auditRouter (sql) {
  const router = express.Router()

  // GET /audit?from=&to=&action=&limit=  (back office — JWT protected)
  router.get('/', jwtAuth, async (req, res) => {
    try {
      const from  = Number(req.query.from)  || 0
      const to    = Number(req.query.to)    || 9999999999999
      const limit = Number(req.query.limit) || 500
      const action = req.query.action || null
      const rows = action
        ? await sql`SELECT * FROM audit_log WHERE created_at >= ${from} AND created_at <= ${to} AND action = ${action} ORDER BY created_at DESC LIMIT ${limit}`
        : await sql`SELECT * FROM audit_log WHERE created_at >= ${from} AND created_at <= ${to} ORDER BY created_at DESC LIMIT ${limit}`
      res.json(rows)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // GET /audit/no-sale  (back office)
  router.get('/no-sale', jwtAuth, async (req, res) => {
    try {
      const from = Number(req.query.from) || 0
      const to   = Number(req.query.to)   || 9999999999999
      const rows = await sql`SELECT * FROM no_sale_log WHERE created_at >= ${from} AND created_at <= ${to} ORDER BY created_at DESC`
      res.json(rows)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // POST /audit/sync  — bulk upsert from Electron terminal (API key protected by outer middleware)
  router.post('/sync', async (req, res) => {
    const rows = req.body
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ ok: true, inserted: 0 })
    try {
      let inserted = 0
      for (const r of rows) {
        await sql`
          INSERT INTO audit_log (id, action, entity_type, entity_id, cashier_id, cashier_name,
                                 approved_by, details, terminal_id, created_at)
          VALUES (${r.id}, ${r.action}, ${r.entity_type || null}, ${r.entity_id || null},
                  ${r.cashier_id || null}, ${r.cashier_name || null}, ${r.approved_by || null},
                  ${r.details || null}, ${r.terminal_id || null}, ${r.created_at})
          ON CONFLICT (id) DO NOTHING
        `
        inserted++
      }
      res.json({ ok: true, inserted })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // POST /audit/no-sale/sync
  router.post('/no-sale/sync', async (req, res) => {
    const rows = req.body
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ ok: true, inserted: 0 })
    try {
      for (const r of rows) {
        await sql`
          INSERT INTO no_sale_log (id, reason, cashier_id, cashier_name, terminal_id, created_at)
          VALUES (${r.id}, ${r.reason}, ${r.cashier_id || null}, ${r.cashier_name || null},
                  ${r.terminal_id || null}, ${r.created_at})
          ON CONFLICT (id) DO NOTHING
        `
      }
      res.json({ ok: true, inserted: rows.length })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  return router
}
