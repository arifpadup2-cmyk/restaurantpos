'use strict'

const express = require('express')
const bcrypt  = require('bcryptjs')
const { sign, jwtAuth } = require('../middleware/jwtAuth')

module.exports = function adminAuthRouter (sql) {
  const router = express.Router()

  // POST /admin-auth/login
  router.post('/login', async (req, res) => {
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // GET /admin-auth/me  (verify token)
  router.get('/me', jwtAuth, (req, res) => {
    if (!req.user.admin) return res.status(403).json({ error: 'Not an admin token' })
    res.json({ ok: true, user: req.user })
  })

  return router
}
