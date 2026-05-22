'use strict'

const jwt = require('jsonwebtoken')

const SECRET = process.env.JWT_SECRET || 'changeme-set-JWT_SECRET-in-env'

let _sql = null
function initJwtAuth (sql) { _sql = sql }

function sign (payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

async function jwtAuth (req, res, next) {
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    const payload = jwt.verify(token, SECRET)
    // Verify user still exists — catches deleted restaurant sessions immediately
    if (_sql) {
      const rows = await _sql`SELECT id FROM bo_users WHERE id = ${payload.id} LIMIT 1`
      if (!rows.length) return res.status(401).json({ error: 'Session expired. Please sign in again.' })
    }
    req.user = payload
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { sign, jwtAuth, initJwtAuth }
