'use strict'

const express = require('express')
const bcrypt  = require('bcryptjs')
const { sign, jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

const _rateBuckets = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of _rateBuckets) if (now > v.reset) _rateBuckets.delete(k)
}, 600000)

function isRateLimited (ip, maxReqs, windowMs) {
  const key = ip + ':admin-login'
  const now = Date.now()
  let entry = _rateBuckets.get(key)
  if (!entry || now > entry.reset) entry = { count: 0, reset: now + windowMs }
  entry.count++
  _rateBuckets.set(key, entry)
  return entry.count > maxReqs
}

module.exports = function adminAuthRouter (sql) {
  const router = express.Router()

  // POST /admin-auth/login
  router.post('/login', async (req, res) => {
    const ip = req.ip || 'unknown'
    if (isRateLimited(ip, 5, 15 * 60 * 1000))
      return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' })

    const { username, password } = req.body || {}
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' })
    try {
      const [user] = await sql`SELECT * FROM admin_users WHERE username = ${username.toLowerCase()}`
      if (!user) return res.status(401).json({ error: 'Invalid credentials' })
      const ok = await bcrypt.compare(password, user.password)
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
      const token = sign({ id: user.id, username: user.username, name: user.name, role: user.role, admin: true })
      res.json({ ok: true, token, user: { id: user.id, username: user.username, name: user.name, role: user.role } })
    } catch (e) { serverError(res, e) }
  })

  // GET /admin-auth/me  (verify token)
  router.get('/me', jwtAuth, (req, res) => {
    if (!req.user.admin) return res.status(403).json({ error: 'Not an admin token' })
    res.json({ ok: true, user: req.user })
  })

  return router
}
