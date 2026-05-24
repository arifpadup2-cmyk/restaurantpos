'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')
const { apiKey, requireTenantTerminal } = require('../middleware/apiKey')
const { serverError } = require('../middleware/serverError')

module.exports = function auditRouter (sql) {
  const router = express.Router()

  // GET /audit?from=&to=&action=&limit=  — back office, brand-scoped
  router.get('/', jwtAuth, async (req, res) => {
    const rid    = req.user.brand_id || ''
    const from   = Number(req.query.from)  || 0
    const to     = Number(req.query.to)    || 9999999999999
    const limit  = Math.min(Number(req.query.limit) || 500, 2000)
    const action = req.query.action || null
    try {
      const rows = action
        ? await sql`SELECT * FROM audit_log WHERE brand_id = ${rid} AND created_at >= ${from} AND created_at <= ${to} AND action = ${action} ORDER BY created_at DESC LIMIT ${limit}`
        : await sql`SELECT * FROM audit_log WHERE brand_id = ${rid} AND created_at >= ${from} AND created_at <= ${to} ORDER BY created_at DESC LIMIT ${limit}`
      res.json(rows)
    } catch (e) { serverError(res, e) }
  })

  // GET /audit/no-sale  — back office, brand-scoped
  router.get('/no-sale', jwtAuth, async (req, res) => {
    const rid  = req.user.brand_id || ''
    const from = Number(req.query.from) || 0
    const to   = Number(req.query.to)   || 9999999999999
    try {
      const rows = await sql`
        SELECT * FROM no_sale_log
        WHERE brand_id = ${rid} AND created_at >= ${from} AND created_at <= ${to}
        ORDER BY created_at DESC`
      res.json(rows)
    } catch (e) { serverError(res, e) }
  })

  // POST /audit/sync — POS terminal bulk upsert (per-terminal API key).
  // brand_id derived from terminal, never from request.
  router.post('/sync', apiKey, requireTenantTerminal, async (req, res) => {
    const brand_id = req.terminal.brand_id
    const rows = req.body
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ ok: true, inserted: 0 })
    try {
      let inserted = 0
      for (const r of rows) {
        await sql`
          INSERT INTO audit_log (id, action, entity_type, entity_id, cashier_id, cashier_name,
                                 approved_by, details, terminal_id, created_at, brand_id)
          VALUES (${r.id}, ${r.action}, ${r.entity_type || null}, ${r.entity_id || null},
                  ${r.cashier_id || null}, ${r.cashier_name || null}, ${r.approved_by || null},
                  ${r.details || null}, ${r.terminal_id || null}, ${r.created_at}, ${brand_id})
          ON CONFLICT (id) DO NOTHING
        `
        inserted++
      }
      res.json({ ok: true, inserted })
    } catch (e) { serverError(res, e) }
  })

  // POST /audit/no-sale/sync — POS terminal (per-terminal API key).
  router.post('/no-sale/sync', apiKey, requireTenantTerminal, async (req, res) => {
    const brand_id = req.terminal.brand_id
    const rows = req.body
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ ok: true, inserted: 0 })
    try {
      for (const r of rows) {
        await sql`
          INSERT INTO no_sale_log (id, reason, cashier_id, cashier_name, terminal_id, created_at, brand_id)
          VALUES (${r.id}, ${r.reason}, ${r.cashier_id || null}, ${r.cashier_name || null},
                  ${r.terminal_id || null}, ${r.created_at}, ${brand_id})
          ON CONFLICT (id) DO NOTHING
        `
      }
      res.json({ ok: true, inserted: rows.length })
    } catch (e) { serverError(res, e) }
  })

  return router
}
