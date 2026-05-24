'use strict'

const jwt = require('jsonwebtoken')
const { randomUUID } = require('crypto')

const SECRET = process.env.JWT_SECRET
const DEFAULT = 'changeme-set-JWT_SECRET-in-env'

if (!SECRET || SECRET === DEFAULT) {
  console.error('\n  ✗ FATAL: JWT_SECRET is missing or set to the insecure default value.')
  console.error('  Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n')
  process.exit(1)
}

// Access tokens: short-lived. Refresh tokens (separate, opaque, stored hashed
// in refresh_tokens table) live for 30 days — see routes/auth.js.
const ACCESS_TTL = process.env.JWT_TTL || '15m'

let _sql = null
function initJwtAuth (sql) { _sql = sql }

function sign (payload, opts = {}) {
  return jwt.sign(
    { ...payload, jti: randomUUID() },
    SECRET,
    { expiresIn: opts.expiresIn || ACCESS_TTL }
  )
}

async function jwtAuth (req, res, next) {
  const auth  = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    const payload = jwt.verify(token, SECRET)
    if (_sql && !payload.admin) {
      if (payload.owner_id) {
        // Owner portal token — validate against owners table
        const rows = await _sql`SELECT id, active FROM owners WHERE id = ${payload.owner_id} LIMIT 1`
        if (!rows.length || rows[0].active === false)
          return res.status(401).json({ error: 'Session expired. Please sign in again.' })
      } else {
        const rows = await _sql`SELECT id, active FROM bo_users WHERE id = ${payload.id} LIMIT 1`
        if (!rows.length || rows[0].active === false)
          return res.status(401).json({ error: 'Session expired. Please sign in again.' })
      }
    }
    req.user = payload
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// requireRole — gate routes by role. Usage: jwtAuth, requireRole('owner','admin')
function requireRole (...allowed) {
  const set = new Set(allowed)
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No user' })
    if (req.user.admin === true) return next()                  // superadmin bypass
    if (!set.has(req.user.role)) return res.status(403).json({ error: 'Insufficient role' })
    next()
  }
}

// requireOutletAccess — when JWT carries an outlet_id claim (cashier/waiter
// pinned to one outlet), reject any request whose outlet_id query/body param
// does not match. When no outlet_id claim is present (owner/admin), allow.
function requireOutletAccess (req, res, next) {
  const claim = req.user?.outlet_id
  if (!claim) return next()
  const requested = req.query.outlet_id || req.body?.outlet_id
  if (requested && requested !== claim)
    return res.status(403).json({ error: 'You are scoped to a different outlet' })
  req.query.outlet_id = claim          // force-scope
  next()
}

module.exports = { sign, jwtAuth, initJwtAuth, requireRole, requireOutletAccess }
