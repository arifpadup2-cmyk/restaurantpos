'use strict'

const express      = require('express')
const { randomUUID } = require('crypto')
const { jwtAuth }  = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')
const logger       = require('../lib/logger')
const { apiKey }   = require('../middleware/apiKey')

module.exports = function terminalLogsRouter (sql) {
  const router = express.Router()

  // ── POST /terminal-logs/upload ────────────────────────────────────────────
  // POS calls this on startup / reconnect to push ERROR+CRITICAL entries.
  // Authenticated with per-terminal api_key (same as other POS calls).
  router.post('/upload', apiKey, async (req, res) => {
    const { entries = [], context = {} } = req.body || {}
    if (!Array.isArray(entries) || entries.length === 0)
      return res.status(400).json({ error: 'entries array required' })

    const brand_id = context.brand_id || req.terminal?.brand_id || ''
    if (!brand_id)
      return res.status(400).json({ error: 'brand_id required in context' })

    const MAX_BATCH = 500
    const batch = entries.slice(0, MAX_BATCH)

    try {
      const rows = batch.map(e => ({
        id:            randomUUID().replace(/-/g, '').slice(0, 24),
        brand_id,
        outlet_id:     context.outlet_id     || e.outlet_id     || null,
        outlet_code:   context.outlet_code   || e.outlet_code   || null,
        outlet_name:   context.outlet_name   || e.outlet_name   || null,
        terminal_name: context.terminal_name || e.terminal_name || null,
        terminal_id:   context.terminal_id   || null,
        device_ip:     context.device_ip     || e.device_ip     || null,
        version:       context.version       || e.version       || null,
        log_timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
        level:         (e.level  || 'INFO').toUpperCase(),
        module:        e.module  || null,
        screen:        e.screen  || null,
        action:        e.action  || 'unknown',
        user_id:       e.user_id || null,
        user_name:     e.user_name || null,
        user_role:     e.user_role || null,
        extra:         e.error || e.stack || e.order_id
          ? JSON.stringify({
              error:    e.error    || undefined,
              stack:    e.stack    || undefined,
              order_id: e.order_id || undefined,
              status:   e.status  || undefined,
            })
          : null,
        uploaded_at:   Date.now(),
      }))

      for (const row of rows) {
        await sql`
          INSERT INTO terminal_log_uploads ${sql(row)}
          ON CONFLICT (id) DO NOTHING`
      }

      logger.info('terminal-logs', 'upload_received', { brand_id }, {
        count: rows.length, outlet_code: context.outlet_code,
      })

      res.json({ ok: true, inserted: rows.length })
    } catch (e) {
      serverError(res, e, req)
    }
  })

  // ── GET /terminal-logs ────────────────────────────────────────────────────
  // Super Admin: filter by brand, outlet, terminal, date, level.
  // Brand Owner: own brand only.
  router.get('/', jwtAuth, async (req, res) => {
    const isAdmin  = req.user?.admin === true
    const brandId  = isAdmin ? (req.query.brand_id || null) : (req.user.brand_id || null)
    const { outlet_id, terminal_name, level, date_from, date_to, limit = 500, offset = 0 } = req.query

    try {
      const conditions = []
      const params     = []
      let   pi         = 1

      if (brandId)      { conditions.push(`brand_id = $${pi++}`)     ; params.push(brandId) }
      if (outlet_id)    { conditions.push(`outlet_id = $${pi++}`)    ; params.push(outlet_id) }
      if (terminal_name){ conditions.push(`terminal_name ILIKE $${pi++}`); params.push('%' + terminal_name + '%') }
      if (level)        { conditions.push(`level = $${pi++}`)        ; params.push(level.toUpperCase()) }
      if (date_from)    { conditions.push(`log_timestamp >= $${pi++}`); params.push(new Date(date_from)) }
      if (date_to)      { conditions.push(`log_timestamp < $${pi++}`) ; params.push(new Date(new Date(date_to).getTime() + 86400000)) }

      const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
      const lim    = Math.min(parseInt(limit,  10) || 500, 1000)
      const off    = Math.max(parseInt(offset, 10) || 0, 0)

      const rows = await sql.unsafe(
        `SELECT * FROM terminal_log_uploads ${where} ORDER BY log_timestamp DESC LIMIT ${lim} OFFSET ${off}`,
        params
      )

      const [{ total }] = await sql.unsafe(
        `SELECT COUNT(*)::int AS total FROM terminal_log_uploads ${where}`,
        params
      )

      // Summary counts by level
      const summaryRows = await sql.unsafe(
        `SELECT level, COUNT(*)::int AS cnt FROM terminal_log_uploads ${where} GROUP BY level ORDER BY level`,
        params
      )
      const summary = {}
      for (const r of summaryRows) summary[r.level] = r.cnt

      res.json({ ok: true, total, rows, summary })
    } catch (e) {
      serverError(res, e, req)
    }
  })

  // ── GET /terminal-logs/terminals ─────────────────────────────────────────
  // Returns distinct terminal names for the given brand (for filter dropdown).
  router.get('/terminals', jwtAuth, async (req, res) => {
    const isAdmin = req.user?.admin === true
    const brandId = isAdmin ? (req.query.brand_id || null) : (req.user.brand_id || null)
    try {
      const rows = brandId
        ? await sql`SELECT DISTINCT terminal_name, outlet_code, outlet_name FROM terminal_log_uploads WHERE brand_id = ${brandId} AND terminal_name IS NOT NULL ORDER BY terminal_name`
        : await sql`SELECT DISTINCT terminal_name, outlet_code, outlet_name FROM terminal_log_uploads WHERE terminal_name IS NOT NULL ORDER BY terminal_name`
      res.json({ ok: true, terminals: rows })
    } catch (e) {
      serverError(res, e, req)
    }
  })

  // ── DELETE /terminal-logs/cleanup ─────────────────────────────────────────
  // Super Admin: delete entries older than 30 days.
  router.delete('/cleanup', jwtAuth, async (req, res) => {
    if (!req.user?.admin) return res.status(403).json({ error: 'Superadmin only' })
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const result = await sql`DELETE FROM terminal_log_uploads WHERE log_timestamp < ${cutoff}`
      logger.info('terminal-logs', 'cleanup', logger.ctxFromReq(req), { deleted: result.count })
      res.json({ ok: true, deleted: result.count })
    } catch (e) {
      serverError(res, e, req)
    }
  })

  return router
}
