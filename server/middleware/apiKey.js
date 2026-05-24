'use strict'

function apiKey (req, res, next) {
  const key = (process.env.API_KEY || '').trim()
  if (!key) {
    if (process.env.NODE_ENV === 'production')
      return res.status(503).json({ error: 'Server misconfigured: API_KEY not set.' })
    return next()
  }
  if (req.headers['x-api-key'] !== key)
    return res.status(401).json({ error: 'Unauthorized' })
  next()
}

module.exports = { apiKey }
