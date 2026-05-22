'use strict'

const express  = require('express')
const bcrypt   = require('bcryptjs')
const { sign, jwtAuth } = require('../middleware/jwtAuth')

module.exports = function authRouter (sql) {
  const router = express.Router()

  // POST /auth/register — create first/new admin user
  router.post('/register', async (req, res) => {
    const { username, password } = req.body || {}
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' })
    if (password.length < 6)
      return res.status(400).json({ error: 'password must be at least 6 characters' })
    if (!/^[a-z0-9_]+$/i.test(username))
      return res.status(400).json({ error: 'username: letters, numbers and _ only' })

    try {
      const existing = await sql`SELECT id FROM bo_users WHERE username = ${username.toLowerCase()}`
      if (existing.length > 0)
        return res.status(409).json({ error: 'username already exists' })

      const id   = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const hash = await bcrypt.hash(password, 10)
      await sql`INSERT INTO bo_users (id, username, password, role) VALUES (${id}, ${username.toLowerCase()}, ${hash}, 'admin')`

      const token = sign({ id, username: username.toLowerCase(), role: 'admin' })
      res.json({ ok: true, token, user: { id, username: username.toLowerCase(), role: 'admin' } })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // POST /auth/login
  router.post('/login', async (req, res) => {
    const { username, password } = req.body || {}
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' })

    try {
      const rows = await sql`SELECT * FROM bo_users WHERE username = ${username.toLowerCase()}`
      if (rows.length === 0)
        return res.status(401).json({ error: 'Invalid username or password' })

      const user = rows[0]
      const ok   = await bcrypt.compare(password, user.password)
      if (!ok)
        return res.status(401).json({ error: 'Invalid username or password' })

      const token = sign({ id: user.id, username: user.username, role: user.role })
      res.json({ ok: true, token, user: { id: user.id, username: user.username, role: user.role } })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // GET /auth/me — verify token and return user
  router.get('/me', jwtAuth, (req, res) => {
    res.json({ ok: true, user: req.user })
  })

  return router
}
