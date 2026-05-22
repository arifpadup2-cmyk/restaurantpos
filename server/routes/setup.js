'use strict'

const express = require('express')
const {
  generateRestaurantId, generateLicenseKey, generateMachineId,
  hashLicenseKey, verifyLicenseKey, keyPrefix, isExpired,
  encryptText, decryptText,
} = require('../lib/license')
const { jwtAuth } = require('../middleware/jwtAuth')

function safeDecrypt (enc) {
  if (!enc) return null
  try { return decryptText(enc) } catch { return null }
}

function decryptRestaurant (r) {
  return {
    ...r,
    license_key:  safeDecrypt(r.license_key_enc),
    bo_password:  safeDecrypt(r.bo_password_enc),
    license_key_enc: undefined,
    bo_password_enc: undefined,
  }
}

module.exports = function setupRouter (sql) {
  const router = express.Router()

  // ── Provider: register a new restaurant ───────────────────────────────────
  router.post('/register', jwtAuth, async (req, res) => {
    const {
      name, max_terminals = 10, expires_days, notes, reseller_name,
      // Brand
      brand_name, business_type, country,
      // Owner
      owner_name, owner_mobile, email, whatsapp,
      // Outlet
      outlet_name, outlet_phone, outlet_email, address,
      google_map_url, opening_time, closing_time,
      order_types, delivery_aggregators, table_count,
    } = req.body || {}
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' })

    try {
      const bcrypt       = require('bcryptjs')
      const id           = generateRestaurantId()
      const licenseKey   = generateLicenseKey()
      const keyHash      = await hashLicenseKey(licenseKey)
      const prefix       = keyPrefix(licenseKey)
      const keyEnc       = encryptText(licenseKey)
      const givenDays    = expires_days ? parseInt(expires_days, 10) : null
      const expiresAt    = givenDays
        ? new Date(Date.now() + givenDays * 86400000).toISOString()
        : null
      const licStartAt   = new Date().toISOString()

      // Auto-generate BO credentials
      const boUsername = (name.trim().toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,12) || 'admin') +
                         Math.floor(Math.random() * 900 + 100)
      const boPassword = Math.random().toString(36).slice(2, 8).toUpperCase() +
                         Math.floor(Math.random() * 90 + 10) + '!'
      const boPassEnc  = encryptText(boPassword)
      const boPassHash = await bcrypt.hash(boPassword, 10)

      await sql`
        INSERT INTO restaurants (
          id, name, brand_name, license_key_hash, license_prefix, license_key_enc,
          max_terminals, expires_at, license_given_days, license_start_at,
          notes, reseller_name, active,
          business_type, country, owner_name, owner_mobile, email, whatsapp,
          outlet_name, outlet_phone, outlet_email, address,
          google_map_url, opening_time, closing_time,
          order_types, delivery_aggregators, table_count,
          bo_username, bo_password_enc, signup_source, status
        ) VALUES (
          ${id}, ${name.trim()}, ${brand_name||name.trim()}, ${keyHash}, ${prefix}, ${keyEnc},
          ${max_terminals}, ${expiresAt}, ${givenDays}, ${licStartAt},
          ${notes||null}, ${reseller_name||null}, ${true},
          ${business_type||null}, ${country||'Malaysia'}, ${owner_name||null}, ${owner_mobile||null},
          ${email||null}, ${whatsapp||null},
          ${outlet_name||name.trim()}, ${outlet_phone||null}, ${outlet_email||null}, ${address||null},
          ${google_map_url||null}, ${opening_time||null}, ${closing_time||null},
          ${order_types||null}, ${delivery_aggregators||null}, ${table_count||0},
          ${boUsername}, ${boPassEnc}, 'admin_panel', 'active'
        )`

      // Create BO user (email stored so owner can sign in with Google later)
      const boId = Date.now().toString(36) + Math.random().toString(36).slice(2,6)
      await sql`
        INSERT INTO bo_users (id, restaurant_id, username, password, email, role)
        VALUES (${boId}, ${id}, ${boUsername}, ${boPassHash}, ${email||null}, 'admin')
        ON CONFLICT (username) DO NOTHING`

      res.json({
        ok: true,
        restaurant: { id, name: name.trim(), license_key: licenseKey, max_terminals, expires_at: expiresAt,
                      bo_username: boUsername, bo_password: boPassword },
        instructions: `Restaurant ID: ${id}  |  License Key: ${licenseKey}`,
      })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Provider: list all restaurants (decrypted) ────────────────────────────
  router.get('/restaurants', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`
        SELECT r.id, r.name, r.license_prefix, r.license_key_enc, r.max_terminals,
          r.expires_at, r.license_given_days, r.license_start_at, r.active, r.created_at, r.notes,
          r.email, r.owner_name, r.phone, r.city, r.country,
          r.plan, r.status, r.trial_ends_at, r.onboarding_step, r.signup_source,
          r.reseller_name, r.last_billed_at, r.bo_username, r.bo_password_enc,
          COUNT(t.id)::int AS terminal_count
        FROM restaurants r
        LEFT JOIN terminal_registrations t ON t.restaurant_id = r.id AND t.active = true
        GROUP BY r.id ORDER BY r.created_at DESC`
      res.json({ ok: true, restaurants: rows.map(decryptRestaurant) })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Provider: get single restaurant ──────────────────────────────────────
  router.get('/restaurants/:id', jwtAuth, async (req, res) => {
    try {
      const [r] = await sql`SELECT * FROM restaurants WHERE id = ${req.params.id}`
      if (!r) return res.status(404).json({ error: 'Not found' })
      const [{ terminal_count }] = await sql`
        SELECT COUNT(*)::int AS terminal_count FROM terminal_registrations
        WHERE restaurant_id = ${req.params.id} AND active = true`
      res.json({ ok: true, restaurant: { ...decryptRestaurant(r), terminal_count } })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Provider: regenerate license key (also re-encrypts) ──────────────────
  router.post('/restaurants/:id/regenerate', jwtAuth, async (req, res) => {
    const { id } = req.params
    try {
      const [row] = await sql`SELECT id FROM restaurants WHERE id = ${id}`
      if (!row) return res.status(404).json({ error: 'Restaurant not found' })
      const newKey  = generateLicenseKey()
      const newHash = await hashLicenseKey(newKey)
      const prefix  = keyPrefix(newKey)
      const newEnc  = encryptText(newKey)
      await sql`UPDATE restaurants SET license_key_hash=${newHash}, license_prefix=${prefix}, license_key_enc=${newEnc} WHERE id=${id}`
      res.json({ ok: true, id, new_license_key: newKey })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Provider: update restaurant ───────────────────────────────────────────
  router.patch('/restaurants/:id', jwtAuth, async (req, res) => {
    const { id } = req.params
    const {
      active, name, max_terminals, expires_days, notes, status,
      extend_trial_days, reseller_name, last_billed_at,
      bo_username, bo_password, license_given_days,
    } = req.body || {}
    try {
      const updates = {}
      if (active          !== undefined) updates.active           = active
      if (name)                          updates.name             = name.trim()
      if (max_terminals)                 updates.max_terminals    = parseInt(max_terminals, 10)
      if (notes           !== undefined) updates.notes            = notes
      if (status)                        updates.status           = status
      if (reseller_name   !== undefined) updates.reseller_name    = reseller_name || null
      if (last_billed_at  !== undefined) updates.last_billed_at   = last_billed_at || null
      if (bo_username     !== undefined) updates.bo_username      = bo_username || null
      if (license_given_days !== undefined)
        updates.license_given_days = license_given_days ? parseInt(license_given_days, 10) : null
      if (bo_password) {
        updates.bo_password_enc = encryptText(bo_password)
        // Also update bo_users table if exists
        const bcrypt = require('bcryptjs')
        const hash   = await bcrypt.hash(bo_password, 10)
        const [boUser] = await sql`SELECT id FROM bo_users WHERE username = ${bo_username || ''}`
        if (boUser) {
          await sql`UPDATE bo_users SET password = ${hash} WHERE username = ${bo_username || ''}`
        }
      }
      if (expires_days)
        updates.expires_at = new Date(Date.now() + parseInt(expires_days, 10) * 86400000).toISOString()
      if (extend_trial_days) {
        const [row] = await sql`SELECT trial_ends_at FROM restaurants WHERE id = ${id}`
        const base = row && row.trial_ends_at && new Date(row.trial_ends_at) > new Date()
          ? new Date(row.trial_ends_at) : new Date()
        updates.trial_ends_at = new Date(base.getTime() + parseInt(extend_trial_days, 10) * 86400000).toISOString()
        updates.status = 'trial'
      }
      if (Object.keys(updates).length)
        await sql`UPDATE restaurants SET ${sql(updates)} WHERE id = ${id}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Provider: delete restaurant + all associated data ────────────────────
  router.delete('/restaurants/:id', jwtAuth, async (req, res) => {
    const { id } = req.params
    try {
      const [r] = await sql`SELECT id, name FROM restaurants WHERE id = ${id}`
      if (!r) return res.status(404).json({ error: 'Restaurant not found' })

      // Get all terminal IDs so we can clean up synced POS data
      const terminals = await sql`SELECT id FROM terminal_registrations WHERE restaurant_id = ${id}`
      const tids = terminals.map(t => t.id)

      if (tids.length > 0) {
        // Transactional data linked via terminal_id
        await sql`DELETE FROM order_items  WHERE order_id IN (SELECT id FROM orders WHERE terminal_id = ANY(${sql.array(tids)}))`
        await sql`DELETE FROM orders       WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM shifts       WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM expenses     WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM day_closings WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM audit_log    WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM no_sale_log  WHERE terminal_id = ANY(${sql.array(tids)})`
      }

      // POS config data linked via restaurant_id (populated after migration 013)
      await sql`DELETE FROM menu_items    WHERE restaurant_id = ${id}`
      await sql`DELETE FROM categories    WHERE restaurant_id = ${id}`
      await sql`DELETE FROM cashiers      WHERE restaurant_id = ${id}`
      await sql`DELETE FROM tables_layout WHERE restaurant_id = ${id}`
      await sql`DELETE FROM customers     WHERE restaurant_id = ${id}`

      await sql`DELETE FROM bo_users               WHERE restaurant_id = ${id}`
      await sql`DELETE FROM terminal_registrations WHERE restaurant_id = ${id}`
      await sql`DELETE FROM restaurants            WHERE id = ${id}`

      res.json({ ok: true, deleted: r.name })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // ── Provider: mark restaurant as billed today ─────────────────────────────
  router.post('/restaurants/:id/bill', jwtAuth, async (req, res) => {
    const { id } = req.params
    const { billed_at, extend_days } = req.body || {}
    try {
      const billedAt = billed_at ? new Date(billed_at).toISOString() : new Date().toISOString()
      const updates  = { last_billed_at: billedAt, status: 'active' }
      if (extend_days) {
        updates.expires_at = new Date(Date.now() + parseInt(extend_days, 10) * 86400000).toISOString()
        updates.license_given_days = parseInt(extend_days, 10)
        updates.license_start_at   = billedAt
      }
      await sql`UPDATE restaurants SET ${sql(updates)} WHERE id = ${id}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Provider: performance stats ───────────────────────────────────────────
  router.get('/stats', jwtAuth, async (_req, res) => {
    try {
      const [totals] = await sql`
        SELECT
          COUNT(*)::int                                          AS total,
          COUNT(*) FILTER (WHERE status='trial')::int           AS trial,
          COUNT(*) FILTER (WHERE status='active')::int          AS active,
          COUNT(*) FILTER (WHERE status='expired')::int         AS expired,
          COUNT(*) FILTER (WHERE status='suspended')::int       AS suspended,
          COUNT(*) FILTER (WHERE created_at > now()-interval '7 days')::int  AS new_7d,
          COUNT(*) FILTER (WHERE created_at > now()-interval '30 days')::int AS new_30d,
          COUNT(*) FILTER (WHERE trial_ends_at < now()+interval '3 days' AND trial_ends_at > now() AND status='trial')::int AS expiring_3d
        FROM restaurants`

      const byCountry = await sql`
        SELECT country, COUNT(*)::int AS cnt FROM restaurants
        WHERE country IS NOT NULL GROUP BY country ORDER BY cnt DESC LIMIT 10`

      const byOnboarding = await sql`
        SELECT onboarding_step, COUNT(*)::int AS cnt FROM restaurants
        GROUP BY onboarding_step ORDER BY onboarding_step`

      const byReseller = await sql`
        SELECT COALESCE(reseller_name,'Direct') AS reseller, COUNT(*)::int AS cnt
        FROM restaurants GROUP BY reseller ORDER BY cnt DESC`

      // Recent monthly signups (last 6 months)
      const monthly = await sql`
        SELECT TO_CHAR(created_at,'YYYY-MM') AS month, COUNT(*)::int AS cnt
        FROM restaurants
        WHERE created_at > now()-interval '6 months'
        GROUP BY month ORDER BY month`

      res.json({ ok: true, totals, byCountry, byOnboarding, byReseller, monthly })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Public: POS terminal connects ────────────────────────────────────────
  router.post('/connect', async (req, res) => {
    const { restaurant_id, license_key, machine_id } = req.body || {}
    if (!restaurant_id || !license_key)
      return res.status(400).json({ error: 'restaurant_id and license_key are required', code: 'MISSING_CREDENTIALS' })

    try {
      const [restaurant] = await sql`SELECT * FROM restaurants WHERE id = ${restaurant_id}`
      if (!restaurant)
        return res.status(401).json({ error: 'Restaurant ID not found. Check your Restaurant ID.', code: 'INVALID_ID' })
      if (!restaurant.active)
        return res.status(403).json({ error: 'This restaurant license has been deactivated. Contact your provider.', code: 'DEACTIVATED' })
      if (isExpired(restaurant.expires_at))
        return res.status(403).json({ error: 'License has expired. Contact your provider to renew.', code: 'EXPIRED' })

      const valid = await verifyLicenseKey(license_key, restaurant.license_key_hash)
      if (!valid)
        return res.status(401).json({ error: 'Invalid License Key. Check your license key and try again.', code: 'INVALID_KEY' })

      const mid        = (machine_id || '').trim() || generateMachineId()
      const terminalId = `${restaurant_id}-${mid}-${Date.now().toString(36)}`

      const [existingTerm] = await sql`
        SELECT id FROM terminal_registrations
        WHERE restaurant_id = ${restaurant_id} AND machine_id = ${mid}`

      if (existingTerm) {
        await sql`UPDATE terminal_registrations SET last_seen=now(), active=true WHERE id=${existingTerm.id}`
      } else {
        const [{ cnt }] = await sql`
          SELECT COUNT(*)::int AS cnt FROM terminal_registrations
          WHERE restaurant_id=${restaurant_id} AND active=true`
        if (cnt >= restaurant.max_terminals)
          return res.status(403).json({
            error: `Terminal limit reached (${restaurant.max_terminals}). Deactivate unused terminals or contact provider.`,
            code: 'TERMINAL_LIMIT',
          })
        await sql`INSERT INTO terminal_registrations (id, restaurant_id, machine_id, last_seen)
                  VALUES (${terminalId}, ${restaurant_id}, ${mid}, now())`
      }

      res.json({
        ok: true,
        machine_id: mid,
        restaurant: { id: restaurant.id, name: restaurant.name },
        db: {
          host:     process.env.DB_HOST || '127.0.0.1',
          port:     parseInt(process.env.DB_PORT || '5432', 10),
          database: process.env.DB_NAME || 'restaurant_pos_central',
          user:     process.env.DB_USER || 'pos_central_user',
          password: process.env.DB_PASS || '',
        },
        api_key: process.env.API_KEY || '',
      })
    } catch (e) { res.status(500).json({ error: e.message, code: 'SERVER_ERROR' }) }
  })

  // ── Public: validate license (lightweight) ────────────────────────────────
  router.post('/validate', async (req, res) => {
    const { restaurant_id, license_key } = req.body || {}
    if (!restaurant_id || !license_key)
      return res.status(400).json({ error: 'Missing credentials', code: 'MISSING' })
    try {
      const [restaurant] = await sql`SELECT * FROM restaurants WHERE id = ${restaurant_id}`
      if (!restaurant) return res.json({ ok: false, code: 'INVALID_ID', error: 'Restaurant ID not found' })
      if (!restaurant.active) return res.json({ ok: false, code: 'DEACTIVATED', error: 'License deactivated' })
      if (isExpired(restaurant.expires_at)) return res.json({ ok: false, code: 'EXPIRED', error: 'License expired' })
      const valid = await verifyLicenseKey(license_key, restaurant.license_key_hash)
      if (!valid) return res.json({ ok: false, code: 'INVALID_KEY', error: 'Invalid license key' })
      res.json({ ok: true, restaurant: { id: restaurant.id, name: restaurant.name }, expires_at: restaurant.expires_at })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Provider: terminals ───────────────────────────────────────────────────
  router.get('/restaurants/:id/terminals', jwtAuth, async (req, res) => {
    try {
      const rows = await sql`
        SELECT * FROM terminal_registrations
        WHERE restaurant_id = ${req.params.id}
        ORDER BY registered_at DESC`
      res.json({ ok: true, terminals: rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/terminals/:id', jwtAuth, async (req, res) => {
    try {
      await sql`UPDATE terminal_registrations SET active=false WHERE id=${req.params.id}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
