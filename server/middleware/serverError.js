'use strict'

function serverError (res, e) {
  const isDev = process.env.NODE_ENV !== 'production'
  if (isDev) console.error('[server error]', e)
  res.status(500).json({ error: isDev ? e.message : 'Internal server error' })
}

module.exports = { serverError }
