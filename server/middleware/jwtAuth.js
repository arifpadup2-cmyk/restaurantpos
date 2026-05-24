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

let _sql = null
function initJwtAuth (sql) { _sql = sql }

function sign (payload) {
  return jwt.sign({ ...payload, jti: randomUUID() }, SECRET, { expiresIn: '4h' })
}

async function jwtAuth (req, res, next) {
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    const payload = jwt.verify(token, SECRET)
    if (_sql && !payload.admin) {
      const rows = await _sql`SELECT id, active FROM bo_users WHERE id = ${payload.id} LIMIT 1`
      if (!rows.length || rows[0].active === false)
        return res.status(401).json({ error: 'Session expired. Please sign in again.' })
    }
    req.user = payload
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { sign, jwtAuth, initJwtAuth }
