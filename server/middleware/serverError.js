'use strict'

function serverError (res, e) {
  console.error('[server error]', e)
  res.status(500).json({ error: e.message || 'Internal server error' })
}

module.exports = { serverError }
