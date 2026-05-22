'use strict'

const jwt = require('jsonwebtoken')

const SECRET = process.env.JWT_SECRET || 'changeme-set-JWT_SECRET-in-env'

function sign (payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

function jwtAuth (req, res, next) {
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    req.user = jwt.verify(token, SECRET)
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { sign, jwtAuth }
