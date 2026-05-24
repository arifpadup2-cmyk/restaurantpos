'use strict'

// Per-terminal API-key middleware.
//
// Each POS / KDS / Waiter terminal authenticates with a key in the form
//   <prefix>.<secret>
// where <prefix> is the first 8 chars (stored plaintext for fast lookup) and
// <secret> is the bcrypt-hashed remainder. The matched terminal_registrations
// row attaches { id, brand_id, outlet_id } to req.terminal.
//
// Legacy global API_KEY env var is still honored as a fallback so existing
// internal-notify and superadmin paths keep working — but ONLY when used with
// the request header `x-api-key` matching it AND the request body never reads
// a brand_id field unchecked (see routes/customers.js, routes/audit.js).
//
// Use:
//   const { apiKey } = require('../middleware/apiKey')
//   router.post('/foo', apiKey(sql), handler)
//
// or for back-compat factory-less call:
//   const { apiKey } = require('../middleware/apiKey')
//   router.post('/foo', apiKey, handler)        // legacy: global key only
//
// In handlers:
//   req.terminal = { id, brand_id, outlet_id }   // when per-terminal key used
//   req.apiKeyKind = 'terminal' | 'global'

const bcrypt = require('bcryptjs')

let _sql = null
function initApiKey (sql) { _sql = sql }

function parseKey (raw) {
  if (!raw) return null
  const dot = raw.indexOf('.')
  if (dot < 8) return null            // prefix must be at least 8 chars
  return { prefix: raw.slice(0, dot), secret: raw.slice(dot + 1) }
}

async function lookupTerminal (raw) {
  if (!_sql) return null
  const parsed = parseKey(raw)
  if (!parsed) return null
  const rows = await _sql`
    SELECT id, brand_id, outlet_id, api_key_hash, revoked_at, active
    FROM terminal_registrations
    WHERE api_key_prefix = ${parsed.prefix}
      AND api_key_hash   IS NOT NULL
    LIMIT 4`
  for (const row of rows) {
    if (row.revoked_at) continue
    if (row.active === false) continue
    // Constant-time compare via bcrypt
    if (await bcrypt.compare(parsed.secret, row.api_key_hash)) {
      // Touch last_seen (fire-and-forget)
      _sql`UPDATE terminal_registrations SET last_seen = now() WHERE id = ${row.id}`.catch(() => {})
      return { id: row.id, brand_id: row.brand_id, outlet_id: row.outlet_id }
    }
  }
  return null
}

async function apiKey (req, res, next) {
  const raw = (req.headers['x-api-key'] || '').trim()
  if (!raw) return res.status(401).json({ error: 'Missing x-api-key header' })

  // Per-terminal key first
  try {
    const terminal = await lookupTerminal(raw)
    if (terminal) {
      req.terminal   = terminal
      req.apiKeyKind = 'terminal'
      return next()
    }
  } catch (e) {
    console.error('apiKey lookup error:', e.message)
  }

  // Fallback to global key (internal/superadmin paths only)
  const globalKey = (process.env.API_KEY || '').trim()
  if (globalKey && raw === globalKey) {
    req.apiKeyKind = 'global'
    return next()
  }
  if (!globalKey && process.env.NODE_ENV !== 'production') {
    // Dev convenience: accept any key when no global key configured AND no
    // per-terminal key matched. Logs warning.
    console.warn('  ⚠ apiKey middleware: dev fallback — no terminal matched and no API_KEY set')
    req.apiKeyKind = 'dev'
    return next()
  }
  return res.status(401).json({ error: 'Unauthorized' })
}

// requireTenantTerminal: helper to enforce per-terminal (not global) auth for
// data-plane writes that need brand_id from the request principal.
function requireTenantTerminal (req, res, next) {
  if (req.apiKeyKind !== 'terminal' || !req.terminal?.brand_id)
    return res.status(401).json({ error: 'Per-terminal API key required for this endpoint' })
  next()
}

module.exports = { apiKey, requireTenantTerminal, initApiKey }
