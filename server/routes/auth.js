'use strict'

const express  = require('express')
const bcrypt   = require('bcryptjs')
const crypto   = require('crypto')
const { randomUUID } = crypto
const { OAuth2Client } = require('google-auth-library')
const { sign, jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

const REFRESH_TTL_DAYS = 30
async function issueRefreshToken (sql, user, req) {
  const raw  = crypto.randomBytes(48).toString('base64url')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const id   = randomUUID()
  const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 86400000).toISOString()
  await sql`
    INSERT INTO refresh_tokens (id, user_id, brand_id, token_hash, user_agent, ip, expires_at)
    VALUES (${id}, ${user.id}, ${user.brand_id || null}, ${hash},
            ${(req.headers['user-agent'] || '').slice(0, 200)}, ${(req.ip || '').slice(0, 64)}, ${expires})`
  return raw
}

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
const _rateBuckets = new Map()
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

function validatePassword (p) {
  if (!p || p.length < 8)         return 'Password must be at least 8 characters'
  if (!/[a-zA-Z]/.test(p))        return 'Password must include at least one letter'
  if (!/[0-9]/.test(p))           return 'Password must include at least one number'
  return null
}

async function writeLoginAudit (sql, userType, userId, username, brandId, success, ip, ua) {
  try {
    await sql`
      INSERT INTO login_audit_log (id, user_type, user_id, username, brand_id, success, ip, user_agent, created_at)
      VALUES (${randomUUID().replace(/-/g,'').slice(0,20)}, ${userType}, ${userId||null}, ${username||null},
              ${brandId||null}, ${success}, ${(ip||'').slice(0,64)}, ${(ua||'').slice(0,200)}, ${Date.now()})`
  } catch (_) {}
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
    const pwdErr = validatePassword(password)
    if (pwdErr) return res.status(400).json({ error: pwdErr })
    if (!/^[a-z0-9_]+$/i.test(username))
      return res.status(400).json({ error: 'username: letters, numbers and _ only' })

    try {
      const existing = await sql`SELECT id FROM bo_users WHERE LOWER(username) = ${username.toLowerCase()}`
      if (existing.length > 0)
        return res.status(409).json({ error: 'username already exists' })

      const id   = randomUUID().replace(/-/g, '').slice(0, 20)
      const hash = await bcrypt.hash(password, 10)
      await sql`INSERT INTO bo_users (id, username, password, role) VALUES (${id}, ${username.toLowerCase()}, ${hash}, 'admin')`

      const token = sign({ id, username: username.toLowerCase(), role: 'admin' })
      res.json({ ok: true, token, user: { id, username: username.toLowerCase(), role: 'admin' } })
    } catch (e) {
      serverError(res, e)
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
      if (user.locked_until && user.locked_until > Date.now())
        return res.status(423).json({ error: 'Account temporarily locked due to too many failed attempts. Try again later.' })

      const ok = await bcrypt.compare(password, user.password)
      if (!ok) {
        try {
          await sql`UPDATE bo_users SET
            failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN ${Date.now() + 15 * 60 * 1000} ELSE locked_until END
            WHERE id = ${user.id}`
        } catch (_) {}
        await writeLoginAudit(sql, 'bo_user', user.id, user.username, user.brand_id || null, false, ip, req.headers['user-agent'])
        return res.status(401).json({ error: 'Invalid username or password' })
      }

      // Block unverified brand owners. Admin and non-brand-scoped users bypass.
      if (user.brand_id) {
        const [brand] = await sql`SELECT email_verified, active, status FROM brands WHERE id = ${user.brand_id}`
        if (brand && brand.active === false)
          return res.status(403).json({ error: 'Brand suspended. Contact support.' })
        if (brand && brand.email_verified === false)
          return res.status(403).json({ error: 'Email not verified. Check your inbox for the verification link.', code: 'EMAIL_NOT_VERIFIED' })
      }

      const outlet_ids  = user.outlet_ids  || null
      const permissions = user.permissions || {}
      const app_access  = user.app_access  || {}
      const token = sign({ id: user.id, username: user.username, role: user.role, brand_id: user.brand_id || null, outlet_ids, permissions, app_access })
      const refresh = await issueRefreshToken(sql, user, req)
      // Reset failed attempts, track login
      try { await sql`UPDATE bo_users SET failed_attempts = 0, locked_until = NULL, last_login_at = ${Date.now()}, login_count = login_count + 1 WHERE id = ${user.id}` } catch (_) {}
      await writeLoginAudit(sql, 'bo_user', user.id, user.username, user.brand_id || null, true, ip, req.headers['user-agent'])
      let owner_name = null
      if (user.brand_id) {
        try {
          const [b] = await sql`SELECT owner_name FROM brands WHERE id = ${user.brand_id}`
          owner_name = b?.owner_name || null
        } catch (_) {}
      }
      res.json({ ok: true, token, refresh, user: { id: user.id, name: user.name || null, username: user.username, role: user.role, brand_id: user.brand_id || null, owner_name, outlet_ids, permissions, app_access } })
    } catch (e) {
      serverError(res, e)
    }
  })

  // POST /auth/refresh — exchange refresh token for new access token
  router.post('/refresh', async (req, res) => {
    const raw = String(req.body?.refresh || '').trim()
    if (!raw) return res.status(400).json({ error: 'refresh required' })
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    try {
      const [row] = await sql`
        SELECT rt.id, rt.user_id, rt.brand_id, rt.expires_at, rt.revoked_at,
               u.id AS uid, u.username, u.role, u.active
        FROM refresh_tokens rt
        JOIN bo_users u ON u.id = rt.user_id
        WHERE rt.token_hash = ${hash}`
      if (!row || row.revoked_at) return res.status(401).json({ error: 'Invalid refresh token' })
      if (new Date(row.expires_at) < new Date())
        return res.status(401).json({ error: 'Refresh token expired' })
      if (row.active === false)
        return res.status(401).json({ error: 'Account disabled' })

      // Rotate: revoke old, issue new — re-fetch user to get latest outlet_ids/permissions/app_access
      const [freshUser] = await sql`SELECT outlet_ids, permissions, app_access FROM bo_users WHERE id = ${row.uid}`
      await sql`UPDATE refresh_tokens SET revoked_at = now() WHERE id = ${row.id}`
      const newRefresh = await issueRefreshToken(sql, { id: row.uid, brand_id: row.brand_id }, req)
      const newAccess  = sign({ id: row.uid, username: row.username, role: row.role, brand_id: row.brand_id || null,
        outlet_ids: freshUser?.outlet_ids || null, permissions: freshUser?.permissions || {},
        app_access: freshUser?.app_access || {} })
      res.json({ ok: true, token: newAccess, refresh: newRefresh })
    } catch (e) { serverError(res, e) }
  })

  // POST /auth/logout — revoke refresh token
  router.post('/logout', async (req, res) => {
    const raw = String(req.body?.refresh || '').trim()
    if (raw) {
      const hash = crypto.createHash('sha256').update(raw).digest('hex')
      try { await sql`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = ${hash}` } catch (_) {}
    }
    res.json({ ok: true })
  })

  // GET /auth/me
  router.get('/me', jwtAuth, async (req, res) => {
    const user = req.user
    let owner_name = null
    if (user.brand_id) {
      try {
        const [b] = await sql`SELECT owner_name FROM brands WHERE id = ${user.brand_id}`
        owner_name = b?.owner_name || null
      } catch (_) {}
    }
    res.json({ ok: true, user: { ...user, owner_name } })
  })

  // GET /auth/config
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
      const client = new OAuth2Client(clientId)
      let payload
      try {
        const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
        payload = ticket.getPayload()
      } catch {
        return res.status(401).json({ error: 'Invalid or expired Google token' })
      }

      const googleId = payload.sub
      const email    = (payload.email || '').toLowerCase()

      let rows = await sql`SELECT * FROM bo_users WHERE google_id = ${googleId} LIMIT 1`

      if (!rows.length && email) {
        rows = await sql`SELECT * FROM bo_users WHERE LOWER(email) = ${email} LIMIT 1`
        if (rows.length) {
          await sql`UPDATE bo_users SET google_id = ${googleId} WHERE id = ${rows[0].id}`
        }
      }

      if (!rows.length) {
        return res.status(403).json({
          error: `No Back Office account linked to ${payload.email || 'this Google account'}. Contact your administrator.`,
        })
      }

      const user = rows[0]
      if (user.active === false)
        return res.status(401).json({ error: 'Account disabled. Contact your administrator.' })

      const outlet_ids2  = user.outlet_ids  || null
      const permissions2 = user.permissions || {}
      const app_access2  = user.app_access  || {}
      const token   = sign({ id: user.id, username: user.username, role: user.role, brand_id: user.brand_id || null, outlet_ids: outlet_ids2, permissions: permissions2, app_access: app_access2 })
      const refresh = await issueRefreshToken(sql, user, req)
      try { await sql`UPDATE bo_users SET last_login_at = ${Date.now()}, login_count = login_count + 1 WHERE id = ${user.id}` } catch (_) {}
      await writeLoginAudit(sql, 'bo_user', user.id, user.username, user.brand_id || null, true, ip, req.headers['user-agent'])
      let owner_name = null
      if (user.brand_id) {
        try {
          const [b] = await sql`SELECT owner_name FROM brands WHERE id = ${user.brand_id}`
          owner_name = b?.owner_name || null
        } catch (_) {}
      }
      res.json({ ok: true, token, refresh, user: { id: user.id, name: user.name || null, username: user.username, role: user.role, brand_id: user.brand_id || null, owner_name, outlet_ids: outlet_ids2, permissions: permissions2 } })
    } catch (e) { serverError(res, e) }
  })

  // POST /auth/signup — self-service 7-day trial signup (email + password)
  router.post('/signup', async (req, res) => {
    const ip = req.ip || 'unknown'
    if (isRateLimited(ip, 'signup', 5, 60 * 60 * 1000))
      return res.status(429).json({ error: 'Too many signup attempts. Try again in 1 hour.' })

    const { email, password } = req.body || {}
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email))
      return res.status(400).json({ error: 'Valid email required' })
    const pwdErr2 = validatePassword(password)
    if (pwdErr2) return res.status(400).json({ error: pwdErr2 })

    try {
      const existing = await sql`SELECT id FROM bo_users WHERE LOWER(email) = ${email.toLowerCase()} LIMIT 1`
      if (existing.length > 0)
        return res.status(409).json({ error: 'Email already registered. Sign in instead.' })

      const { generateRestaurantId, generateLicenseKey, hashLicenseKey, keyPrefix } = require('../lib/license')
      const crypto2 = require('crypto')
      const id         = generateRestaurantId()
      const licKey     = generateLicenseKey()
      const keyHash    = await hashLicenseKey(licKey)
      const prefix     = keyPrefix(licKey)
      const trialEnds  = new Date(Date.now() + 7 * 86400000).toISOString()
      const placeholder = email.toLowerCase().split('@')[0]
      const verifyToken = crypto2.randomBytes(32).toString('hex')
      const verifyExp   = new Date(Date.now() + 24 * 3600000).toISOString()

      const uid      = randomUUID().replace(/-/g, '').slice(0, 20)
      const username = (placeholder.replace(/[^a-z0-9_]/g, '_').slice(0, 16) + '_' + id.slice(-4)).toLowerCase()
      const hash     = await bcrypt.hash(password, 10)
      const marketId = 'mkt-' + crypto2.randomUUID().replace(/-/g, '').slice(0, 16)
      const outletId = 'out-' + crypto2.randomUUID().replace(/-/g, '').slice(0, 16)

      await sql.begin(async t => {
        await t`
          INSERT INTO brands (
            id, name, license_key_hash, license_prefix, max_terminals,
            email, active, plan, status, trial_ends_at, signup_source,
            email_verified, email_verification_token, email_verification_expires
          ) VALUES (
            ${id}, ${placeholder}, ${keyHash}, ${prefix}, ${5},
            ${email.toLowerCase()}, ${true}, ${'trial'}, ${'trial'}, ${trialEnds}, ${'self_signup'},
            ${false}, ${verifyToken}, ${verifyExp}
          )`
        await t`
          INSERT INTO bo_users (id, brand_id, username, password, email, role)
          VALUES (${uid}, ${id}, ${username}, ${hash}, ${email.toLowerCase()}, 'owner')`
        await t`
          INSERT INTO markets (id, brand_id, name, currency_code, currency_symbol)
          VALUES (${marketId}, ${id}, 'Default Market', 'USD', '$')`
        await t`
          INSERT INTO outlets (id, brand_id, market_id, name, currency, currency_code, currency_symbol)
          VALUES (${outletId}, ${id}, ${marketId}, 'Main Outlet', 'USD', 'USD', '$')`
      })

      console.log(`  ✉ Verification email queued for ${email}: /api/signup/verify?t=${verifyToken}`)

      // Email not yet verified → return user info but no usable token.
      res.json({
        ok: true,
        user: { id: uid, username, role: 'owner', brand_id: id, email: email.toLowerCase() },
        trialEndsAt: trialEnds,
        verify_required: true,
      })
    } catch (e) {
      serverError(res, e)
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
      const client2 = new OAuth2Client(clientId)
      let payload2
      try {
        const ticket = await client2.verifyIdToken({ idToken: credential, audience: clientId })
        payload2 = ticket.getPayload()
      } catch {
        return res.status(401).json({ error: 'Invalid or expired Google token' })
      }

      const googleId = payload2.sub
      const email    = (payload2.email || '').toLowerCase()

      if (email) {
        const existing = await sql`SELECT id FROM bo_users WHERE google_id = ${googleId} OR LOWER(email) = ${email} LIMIT 1`
        if (existing.length > 0)
          return res.status(409).json({ error: 'Account already exists. Sign in instead.' })
      }

      const { generateRestaurantId, generateLicenseKey, hashLicenseKey, keyPrefix } = require('../lib/license')
      const crypto3 = require('crypto')
      const id        = generateRestaurantId()
      const licKey    = generateLicenseKey()
      const keyHash   = await hashLicenseKey(licKey)
      const prefix    = keyPrefix(licKey)
      const trialEnds = new Date(Date.now() + 7 * 86400000).toISOString()
      const placeholder = (email || 'user').split('@')[0]
      const uid      = randomUUID().replace(/-/g, '').slice(0, 20)
      const username = (placeholder.replace(/[^a-z0-9_]/g, '_').slice(0, 16) + '_' + id.slice(-4)).toLowerCase()
      const marketId = 'mkt-' + crypto3.randomUUID().replace(/-/g, '').slice(0, 16)
      const outletId = 'out-' + crypto3.randomUUID().replace(/-/g, '').slice(0, 16)

      await sql.begin(async t => {
        // Google sign-in implies verified email
        await t`
          INSERT INTO brands (
            id, name, license_key_hash, license_prefix, max_terminals,
            email, active, plan, status, trial_ends_at, signup_source, email_verified
          ) VALUES (
            ${id}, ${placeholder}, ${keyHash}, ${prefix}, ${5},
            ${email}, ${true}, ${'trial'}, ${'trial'}, ${trialEnds}, ${'self_signup'}, ${true}
          )`
        await t`
          INSERT INTO bo_users (id, brand_id, username, password, email, google_id, role)
          VALUES (${uid}, ${id}, ${username}, '', ${email}, ${googleId}, 'owner')`
        await t`
          INSERT INTO markets (id, brand_id, name, currency_code, currency_symbol)
          VALUES (${marketId}, ${id}, 'Default Market', 'USD', '$')`
        await t`
          INSERT INTO outlets (id, brand_id, market_id, name, currency, currency_code, currency_symbol)
          VALUES (${outletId}, ${id}, ${marketId}, 'Main Outlet', 'USD', 'USD', '$')`
      })

      const token = sign({ id: uid, username, role: 'owner', brand_id: id, email })
      res.json({ ok: true, token, user: { id: uid, username, role: 'owner', brand_id: id, email }, trialEndsAt: trialEnds })
    } catch (e) { serverError(res, e) }
  })

  return router
}
