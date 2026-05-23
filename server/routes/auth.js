'use strict'

const express  = require('express')
const bcrypt   = require('bcryptjs')
const { sign, jwtAuth } = require('../middleware/jwtAuth')

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
const _rateBuckets = new Map()
// Periodically prune expired buckets (every 10 min)
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of _rateBuckets) if (now > v.reset) _rateBuckets.delete(k)
}, 600000)

function isRateLimited (ip, scope, maxReqs, windowMs) {
  const key = ip + ':' + scope
  const now = Date.now()
  let entry = _rateBuckets.get(key)
  if (!entry || now > entry.reset) entry = { count: 0, reset: now + windowMs }
  entry.count++
  _rateBuckets.set(key, entry)
  return entry.count > maxReqs
}

module.exports = function authRouter (sql) {
  const router = express.Router()

  // POST /auth/register — create admin user (requires existing admin session)
  router.post('/register', jwtAuth, async (req, res) => {
    if (!req.user.admin && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Admin access required' })
    const { username, password } = req.body || {}
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' })
    if (password.length < 6)
      return res.status(400).json({ error: 'password must be at least 6 characters' })
    if (!/^[a-z0-9_]+$/i.test(username))
      return res.status(400).json({ error: 'username: letters, numbers and _ only' })

    try {
      const existing = await sql`SELECT id FROM bo_users WHERE LOWER(username) = ${username.toLowerCase()}`
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
    const ip = req.ip || 'unknown'
    if (isRateLimited(ip, 'login', 10, 15 * 60 * 1000))
      return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' })

    const { username, password } = req.body || {}
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' })

    try {
      const rows = await sql`SELECT * FROM bo_users WHERE LOWER(username) = ${username.toLowerCase()}`
      if (rows.length === 0)
        return res.status(401).json({ error: 'Invalid username or password' })

      const user = rows[0]
      if (user.active === false)
        return res.status(401).json({ error: 'Account disabled. Contact your administrator.' })

      const ok   = await bcrypt.compare(password, user.password)
      if (!ok)
        return res.status(401).json({ error: 'Invalid username or password' })

      const token = sign({ id: user.id, username: user.username, role: user.role, restaurant_id: user.restaurant_id || null })
      let owner_name = null
      if (user.restaurant_id) {
        try {
          const [r] = await sql`SELECT owner_name FROM restaurants WHERE id = ${user.restaurant_id}`
          owner_name = r?.owner_name || null
        } catch (_) {}
      }
      res.json({ ok: true, token, user: { id: user.id, username: user.username, role: user.role, restaurant_id: user.restaurant_id || null, owner_name } })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // GET /auth/me — verify token and return user with enriched profile
  router.get('/me', jwtAuth, async (req, res) => {
    const user = req.user
    let owner_name = null
    if (user.restaurant_id) {
      try {
        const [r] = await sql`SELECT owner_name FROM restaurants WHERE id = ${user.restaurant_id}`
        owner_name = r?.owner_name || null
      } catch (_) {}
    }
    res.json({ ok: true, user: { ...user, owner_name } })
  })

  // GET /auth/config — public config for the front-end
  router.get('/config', (_req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null })
  })

  // POST /auth/google — sign in with Google ID token
  router.post('/google', async (req, res) => {
    const ip = req.ip || 'unknown'
    if (isRateLimited(ip, 'google', 10, 15 * 60 * 1000))
      return res.status(429).json({ error: 'Too many requests. Try again later.' })

    const { credential } = req.body || {}
    if (!credential) return res.status(400).json({ error: 'credential required' })

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) return res.status(503).json({ error: 'Google sign-in not configured on this server' })

    try {
      const r    = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`)
      const info = await r.json()

      if (info.error_description || !info.sub)
        return res.status(401).json({ error: 'Invalid Google token: ' + (info.error_description || 'verification failed') })

      if (info.aud !== clientId)
        return res.status(401).json({ error: 'Token audience mismatch — wrong Google client ID' })

      const googleId = info.sub
      const email    = (info.email || '').toLowerCase()

      let rows = await sql`SELECT * FROM bo_users WHERE google_id = ${googleId} LIMIT 1`

      if (!rows.length && email) {
        rows = await sql`SELECT * FROM bo_users WHERE LOWER(email) = ${email} LIMIT 1`
        if (rows.length) {
          await sql`UPDATE bo_users SET google_id = ${googleId} WHERE id = ${rows[0].id}`
        }
      }

      if (!rows.length) {
        return res.status(403).json({
          error: `No Back Office account linked to ${info.email || 'this Google account'}. Contact your administrator.`,
        })
      }

      const user = rows[0]
      if (user.active === false)
        return res.status(401).json({ error: 'Account disabled. Contact your administrator.' })

      const token = sign({ id: user.id, username: user.username, role: user.role, restaurant_id: user.restaurant_id || null })
      let owner_name = null
      if (user.restaurant_id) {
        try {
          const [r] = await sql`SELECT owner_name FROM restaurants WHERE id = ${user.restaurant_id}`
          owner_name = r?.owner_name || null
        } catch (_) {}
      }
      res.json({ ok: true, token, user: { id: user.id, username: user.username, role: user.role, restaurant_id: user.restaurant_id || null, owner_name } })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // POST /auth/signup — self-service 7-day trial signup (email + password only)
  router.post('/signup', async (req, res) => {
    const ip = req.ip || 'unknown'
    if (isRateLimited(ip, 'signup', 5, 60 * 60 * 1000))
      return res.status(429).json({ error: 'Too many signup attempts. Try again in 1 hour.' })

    const { email, password } = req.body || {}
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email))
      return res.status(400).json({ error: 'Valid email required' })
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' })

    try {
      const existing = await sql`SELECT id FROM bo_users WHERE LOWER(email) = ${email.toLowerCase()} LIMIT 1`
      if (existing.length > 0)
        return res.status(409).json({ error: 'Email already registered. Sign in instead.' })

      const { generateRestaurantId, generateLicenseKey, hashLicenseKey, keyPrefix, encryptText } = require('../lib/license')
      const id         = generateRestaurantId()
      const licKey     = generateLicenseKey()
      const keyHash    = await hashLicenseKey(licKey)
      const prefix     = keyPrefix(licKey)
      const keyEnc     = encryptText(licKey)
      const trialEnds  = new Date(Date.now() + 7 * 86400000).toISOString()
      const now        = new Date().toISOString()
      const placeholder = email.toLowerCase().split('@')[0]

      await sql`
        INSERT INTO restaurants (
          id, name, brand_name, license_key_hash, license_prefix, license_key_enc,
          max_terminals, license_start_at,
          owner_name, email, active, plan, status, trial_ends_at, signup_source, setup_done
        ) VALUES (
          ${id}, ${placeholder}, ${placeholder},
          ${keyHash}, ${prefix}, ${keyEnc},
          5, ${now},
          '', ${email.toLowerCase()},
          true, 'trial', 'trial', ${trialEnds}, 'self_signup', false
        )`

      const uid      = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const username = (placeholder.replace(/[^a-z0-9_]/g, '_').slice(0, 16) + '_' + id.slice(-4)).toLowerCase()
      const hash     = await bcrypt.hash(password, 10)

      await sql`
        INSERT INTO bo_users (id, restaurant_id, username, password, email, role)
        VALUES (${uid}, ${id}, ${username}, ${hash}, ${email.toLowerCase()}, 'owner')`

      const token = sign({ id: uid, username, role: 'owner', restaurant_id: id, email: email.toLowerCase() })
      let owner_name = null
      if (id) {
        try {
          const [r] = await sql`SELECT owner_name FROM restaurants WHERE id = ${id}`
          owner_name = r?.owner_name || null
        } catch (_) {}
      }
      res.json({ ok: true, token, user: { id: uid, username, role: 'owner', restaurant_id: id, email: email.toLowerCase(), owner_name }, trialEndsAt: trialEnds })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // POST /auth/signup/google — self-service trial signup via Google
  router.post('/signup/google', async (req, res) => {
    const ip = req.ip || 'unknown'
    if (isRateLimited(ip, 'signup', 5, 60 * 60 * 1000))
      return res.status(429).json({ error: 'Too many signup attempts. Try again in 1 hour.' })

    const { credential } = req.body || {}
    if (!credential) return res.status(400).json({ error: 'credential required' })

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) return res.status(503).json({ error: 'Google sign-in not configured on this server' })

    try {
      const r    = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`)
      const info = await r.json()

      if (info.error_description || !info.sub)
        return res.status(401).json({ error: 'Invalid Google token: ' + (info.error_description || 'verification failed') })
      if (info.aud !== clientId)
        return res.status(401).json({ error: 'Token audience mismatch — wrong Google client ID' })

      const googleId = info.sub
      const email    = (info.email || '').toLowerCase()

      if (email) {
        const existing = await sql`SELECT id FROM bo_users WHERE google_id = ${googleId} OR LOWER(email) = ${email} LIMIT 1`
        if (existing.length > 0)
          return res.status(409).json({ error: 'Account already exists. Sign in instead.' })
      }

      const { generateRestaurantId, generateLicenseKey, hashLicenseKey, keyPrefix, encryptText } = require('../lib/license')
      const id        = generateRestaurantId()
      const licKey    = generateLicenseKey()
      const keyHash   = await hashLicenseKey(licKey)
      const prefix    = keyPrefix(licKey)
      const keyEnc    = encryptText(licKey)
      const trialEnds = new Date(Date.now() + 7 * 86400000).toISOString()
      const now       = new Date().toISOString()

      const placeholder = (email || 'user').split('@')[0]
      await sql`
        INSERT INTO restaurants (
          id, name, brand_name, license_key_hash, license_prefix, license_key_enc,
          max_terminals, license_start_at,
          owner_name, email, active, plan, status, trial_ends_at, signup_source, setup_done
        ) VALUES (
          ${id}, ${placeholder}, ${placeholder},
          ${keyHash}, ${prefix}, ${keyEnc},
          5, ${now},
          '', ${email},
          true, 'trial', 'trial', ${trialEnds}, 'self_signup', false
        )`

      const uid      = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const username = (placeholder.replace(/[^a-z0-9_]/g, '_').slice(0, 16) + '_' + id.slice(-4)).toLowerCase()

      await sql`
        INSERT INTO bo_users (id, restaurant_id, username, password, email, google_id, role)
        VALUES (${uid}, ${id}, ${username}, '', ${email}, ${googleId}, 'owner')`

      const token = sign({ id: uid, username, role: 'owner', restaurant_id: id, email })
      let owner_name = null
      if (id) {
        try {
          const [r] = await sql`SELECT owner_name FROM restaurants WHERE id = ${id}`
          owner_name = r?.owner_name || null
        } catch (_) {}
      }
      res.json({ ok: true, token, user: { id: uid, username, role: 'owner', restaurant_id: id, email, owner_name }, trialEndsAt: trialEnds })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  return router
}
