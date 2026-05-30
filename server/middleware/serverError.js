'use strict'

const logger = require('../lib/logger')

function serverError (res, e, req) {
  const isDev = process.env.NODE_ENV !== 'production'
  console.error('[server error]', e)

  // Log the error with full context
  const ctx = req ? logger.ctxFromReq(req) : {}
  logger.error('server', 'unhandled_route_error', ctx, {
    error:  e.message,
    stack:  e.stack,
    code:   e.code,
  })

  res.status(500).json({ error: isDev ? e.message : 'Internal server error' })
}

module.exports = { serverError }
