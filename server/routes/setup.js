'use strict'

const crypto  = require('crypto')
const express = require('express')
const {
  generateRestaurantId, generateLicenseKey, generateMachineId,
  hashLicenseKey, verifyLicenseKey, keyPrefix, isExpired,
} = require('../lib/license')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')
const { apiKey } = require('../middleware/apiKey')
const bcrypt = require('bcryptjs')

// ── Outlet provisioning helpers (cloud → local) ───────────────────────────────

// Issue a fresh per-terminal API key and register/refresh the terminal row.
async function registerTerminal (sql, outlet, machine_id) {
  const brand_id = outlet.brand_id
  const mid = (machine_id || '').trim() || generateMachineId()
  const [existing] = await sql`SELECT id FROM terminal_registrations WHERE brand_id = ${brand_id} AND machine_id = ${mid}`
  const { randomBytes } = require('crypto')
  const tkPrefix = randomBytes(6).toString('hex')
  const tkSecret = randomBytes(24).toString('base64url')
  const tkRaw    = `${tkPrefix}.${tkSecret}`
  const tkHash   = await bcrypt.hash(tkSecret, 10)
  let terminalId
  if (existing) {
    terminalId = existing.id
    await sql`UPDATE terminal_registrations SET last_seen=now(), active=true, outlet_id=${outlet.id}, api_key_prefix=${tkPrefix}, api_key_hash=${tkHash}, revoked_at=NULL WHERE id=${existing.id}`
  } else {
    terminalId = `${brand_id}-${mid}-${Date.now().toString(36)}`
    await sql`INSERT INTO terminal_registrations (id, brand_id, machine_id, outlet_id, last_seen, active, api_key_prefix, api_key_hash) VALUES (${terminalId}, ${brand_id}, ${mid}, ${outlet.id}, now(), true, ${tkPrefix}, ${tkHash})`
  }
  return { terminalId, apiKey: tkRaw }
}

// Upsert ONE outlet's data (returned by /setup/provision) into the local DB.
async function seedOutletData (sql, data) {
  const summary = {}
  await sql.begin(async t => {
    const up = async (table, rows, conflict) => {
      let n = 0
      for (const row of (rows || [])) {
        if (!row || !Object.keys(row).length) continue
        const cols = Object.keys(row)
        await t`INSERT INTO ${t(table)} ${t(row, ...cols)}
                ON CONFLICT (${t.unsafe(conflict)}) DO UPDATE SET ${t(row, ...cols)}`
        n++
      }
      return n
    }
    if (data.brand)  summary.brands  = await up('brands',  [data.brand],  'id')
    // Markets must be seeded before outlets (outlets.market_id → markets FK, NOT NULL).
    summary.markets = await up('markets', data.markets, 'id')
    if (data.outlet) summary.outlets = await up('outlets', [data.outlet], 'id')
    summary.categories = await up('categories', data.categories, 'id')
    summary.menu_items = await up('menu_items', data.menu_items, 'id')
    summary.cashiers   = await up('cashiers',   data.cashiers,   'id')
    // Strip transient lock/order state when importing another machine's tables.
    const tables = (data.tables_layout || []).map(r => ({ ...r, current_order_id: null, locked_by: null, status: 'available' }))
    summary.tables_layout = await up('tables_layout', tables, 'id')
    summary.settings = await up('settings', data.settings, 'brand_id, outlet_id, key')
  })
  return summary
}

// Reversible BO password / license storage was removed for security.
// Credentials are shown once at creation/regeneration and must be reset if lost.
function scrubBrand (r) {
  if (!r) return r
  const { bo_password_enc, license_key_enc, ...rest } = r
  return { ...rest, license_key: null, bo_password: null }
}
const decryptBrand = scrubBrand    // back-compat alias for existing call sites

const { randomUUID } = require('crypto')
function uid () { return randomUUID().replace(/-/g, '').slice(0, 16) }

const COUNTRY_CURRENCY = {
  Malaysia: { code: 'MYR', symbol: 'RM' },
  Singapore: { code: 'SGD', symbol: 'S$' },
  Indonesia: { code: 'IDR', symbol: 'Rp' },
  Thailand: { code: 'THB', symbol: '฿' },
  Philippines: { code: 'PHP', symbol: '₱' },
  Vietnam: { code: 'VND', symbol: '₫' },
  India: { code: 'INR', symbol: '₹' },
  Pakistan: { code: 'PKR', symbol: '₨' },
  Bangladesh: { code: 'BDT', symbol: '৳' },
  'Sri Lanka': { code: 'LKR', symbol: '₨' },
  China: { code: 'CNY', symbol: '¥' },
  Japan: { code: 'JPY', symbol: '¥' },
  'South Korea': { code: 'KRW', symbol: '₩' },
  'Hong Kong': { code: 'HKD', symbol: 'HK$' },
  Taiwan: { code: 'TWD', symbol: 'NT$' },
  'United Kingdom': { code: 'GBP', symbol: '£' },
  'United States': { code: 'USD', symbol: '$' },
  Canada: { code: 'CAD', symbol: 'C$' },
  Australia: { code: 'AUD', symbol: 'A$' },
  'New Zealand': { code: 'NZD', symbol: 'NZ$' },
  'United Arab Emirates': { code: 'AED', symbol: 'د.إ' },
  'Saudi Arabia': { code: 'SAR', symbol: '﷼' },
  Qatar: { code: 'QAR', symbol: '﷼' },
  Kuwait: { code: 'KWD', symbol: 'د.ك' },
  Bahrain: { code: 'BHD', symbol: 'BD' },
  Oman: { code: 'OMR', symbol: 'ر.ع.' },
  Jordan: { code: 'JOD', symbol: 'JD' },
  Egypt: { code: 'EGP', symbol: 'E£' },
  Nigeria: { code: 'NGN', symbol: '₦' },
  Kenya: { code: 'KES', symbol: 'KSh' },
  'South Africa': { code: 'ZAR', symbol: 'R' },
}
function currencyForCountry (country) {
  return COUNTRY_CURRENCY[country] || { code: 'USD', symbol: '$' }
}

module.exports = function setupRouter (sql) {
  const router = express.Router()

  // ── Admin: create owner account ───────────────────────────────────
  router.post('/owners', jwtAuth, async (req, res) => {
    if (!req.user.admin) return res.status(403).json({ error: 'Superadmin only' })
    const { name, username, password, email } = req.body || {}
    if (!name || !username || !password)
      return res.status(400).json({ error: 'name, username, password required' })
    try {
      const existing = await sql`SELECT id FROM owners WHERE LOWER(username) = ${username.toLowerCase()}`
      if (existing.length) return res.status(409).json({ error: 'Username already taken' })
      const id   = 'own-' + uid()
      const hash = await bcrypt.hash(password, 10)
      const [owner] = await sql`
        INSERT INTO owners (id, name, username, password, email)
        VALUES (${id}, ${name}, ${username.toLowerCase()}, ${hash}, ${email || null})
        RETURNING id, name, username, email, created_at`
      res.json({ ok: true, owner })
    } catch (e) { serverError(res, e) }
  })

  // ── Admin: list owners ────────────────────────────────────────────
  router.get('/owners', jwtAuth, async (req, res) => {
    if (!req.user.admin) return res.status(403).json({ error: 'Superadmin only' })
    try {
      const owners = await sql`
        SELECT o.*, ARRAY_AGG(ob.brand_id) FILTER (WHERE ob.brand_id IS NOT NULL) AS brand_ids
        FROM owners o LEFT JOIN owner_brands ob ON ob.owner_id = o.id
        GROUP BY o.id ORDER BY o.created_at DESC`
      res.json({ owners })
    } catch (e) { serverError(res, e) }
  })

  // ── Admin: link brand to owner ────────────────────────────────────
  router.post('/owners/:id/brands', jwtAuth, async (req, res) => {
    if (!req.user.admin) return res.status(403).json({ error: 'Superadmin only' })
    const { brand_id } = req.body || {}
    if (!brand_id) return res.status(400).json({ error: 'brand_id required' })
    try {
      const [owner] = await sql`SELECT id FROM owners WHERE id = ${req.params.id}`
      if (!owner) return res.status(404).json({ error: 'Owner not found' })
      const [brand] = await sql`SELECT id, name FROM brands WHERE id = ${brand_id}`
      if (!brand) return res.status(404).json({ error: 'Brand not found' })
      await sql`
        INSERT INTO owner_brands (owner_id, brand_id) VALUES (${req.params.id}, ${brand_id})
        ON CONFLICT DO NOTHING`
      res.json({ ok: true, owner_id: req.params.id, brand_id, brand_name: brand.name })
    } catch (e) { serverError(res, e) }
  })

  // ── Admin: unlink brand from owner ────────────────────────────────
  router.delete('/owners/:id/brands/:brand_id', jwtAuth, async (req, res) => {
    if (!req.user.admin) return res.status(403).json({ error: 'Superadmin only' })
    try {
      await sql`DELETE FROM owner_brands WHERE owner_id = ${req.params.id} AND brand_id = ${req.params.brand_id}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: wipe ALL data (keeps admin_users + backup_log) ───────────
  router.post('/wipe-all-data', jwtAuth, async (req, res) => {
    if (!req.user.admin) return res.status(403).json({ error: 'Superadmin only' })
    try {
      await sql.unsafe(`
        TRUNCATE TABLE
          item_modifier_groups, modifier_options, modifier_groups, item_variants,
          order_items, orders, expenses, shifts, day_closings,
          audit_log, no_sale_log, customers,
          tables_layout, table_sections,
          menu_items, categories,
          cashiers, settings,
          tax_groups, payment_methods, delivery_partners, order_types, kitchens, designations,
          terminal_registrations,
          outlets, markets, brands, bo_users
        CASCADE
      `)
      res.json({ ok: true, message: 'All data wiped. System is clean.' })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: register new brand ────────────────────────────────────────
  router.post('/register', jwtAuth, async (req, res) => {
    const {
      name, max_terminals = 10, expires_days, notes, reseller_name,
      business_type, country,
      owner_name, owner_mobile, email, whatsapp,
      outlet_name, outlet_phone, outlet_email, address,
      google_map_url, opening_time, closing_time,
      tax_system, tax_rate,
      order_types_list, delivery_aggregators, table_count,
    } = req.body || {}
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' })

    try {
      const id         = generateRestaurantId()
      const licenseKey = generateLicenseKey()
      const keyHash    = await hashLicenseKey(licenseKey)
      const prefix     = keyPrefix(licenseKey)
      const givenDays  = expires_days ? parseInt(expires_days, 10) : null
      const expiresAt  = givenDays ? new Date(Date.now() + givenDays * 86400000).toISOString() : null
      const licStartAt = new Date().toISOString()

      const boUsername = (name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'admin') +
                         Math.floor(Math.random() * 900 + 100)
      const boPassword = Math.random().toString(36).slice(2, 8).toUpperCase() +
                         Math.floor(Math.random() * 90 + 10) + '!'
      const boPassHash = await bcrypt.hash(boPassword, 10)

      await sql`
        INSERT INTO brands (
          id, name, license_key_hash, license_prefix,
          max_terminals, expires_at, notes, active,
          business_type, country, owner_name, email, phone, whatsapp_number,
          bo_username, signup_source, status, plan, email_verified
        ) VALUES (
          ${id}, ${name.trim()}, ${keyHash}, ${prefix},
          ${max_terminals}, ${expiresAt}, ${notes || null}, ${true},
          ${business_type || null}, ${country || 'Malaysia'}, ${owner_name || null},
          ${email || null}, ${owner_mobile || null}, ${whatsapp || null},
          ${boUsername}, 'admin_panel', 'active', 'paid', ${true}
        )`

      // Create BO owner user
      const boId = uid()
      await sql`
        INSERT INTO bo_users (id, brand_id, username, password, email, role)
        VALUES (${boId}, ${id}, ${boUsername}, ${boPassHash}, ${email || null}, 'owner')
        ON CONFLICT (username) DO NOTHING`

      // Create default market — use country-derived currency, not hardcoded MYR
      const marketId = 'mkt-' + uid()
      const mktCur = currencyForCountry(country)
      await sql`
        INSERT INTO markets (id, brand_id, name, country, currency_code, currency_symbol)
        VALUES (${marketId}, ${id}, 'Default Market', ${country || null}, ${mktCur.code}, ${mktCur.symbol})`

      // Create default outlet
      const outletId = 'out-' + uid()
      await sql`
        INSERT INTO outlets (id, brand_id, market_id, name, phone, email, address, opening_time, closing_time, country, currency, currency_code, currency_symbol)
        VALUES (${outletId}, ${id}, ${marketId},
          ${outlet_name || name.trim() + ' - Main'},
          ${outlet_phone || null}, ${outlet_email || null}, ${address || null},
          ${opening_time || '09:00'}, ${closing_time || '22:00'},
          ${country || null}, ${mktCur.code}, ${mktCur.code}, ${mktCur.symbol})`

      // Store initial settings (tax, branch name)
      const taxRateVal  = parseFloat(tax_rate) || 0
      const taxSysVal   = tax_system || 'exclusive'
      const branchName  = outlet_name || name.trim() + ' - Main'
      for (const [key, val] of [['tax_rate', String(taxRateVal)], ['tax_system', taxSysVal], ['branch_name', branchName]]) {
        await sql`INSERT INTO settings (brand_id, outlet_id, key, value) VALUES (${id}, ${''}, ${key}, ${val}) ON CONFLICT (brand_id, outlet_id, key) DO UPDATE SET value = EXCLUDED.value`
      }

      res.json({
        ok: true,
        brand: { id, name: name.trim(), license_key: licenseKey, max_terminals, expires_at: expiresAt,
                 bo_username: boUsername, bo_password: boPassword },
        market: { id: marketId },
        outlet: { id: outletId },
        instructions: `Brand ID: ${id}  |  License Key: ${licenseKey}`,
      })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: list all brands ───────────────────────────────────────────
  router.get('/restaurants', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`
        SELECT b.id, b.name, b.license_prefix, b.max_terminals,
          b.expires_at, b.active, b.created_at, b.notes,
          b.email, b.owner_name, b.phone, b.city, b.country, b.whatsapp_number,
          b.plan, b.status, b.trial_ends_at, b.onboarding_step, b.signup_source,
          b.reseller, b.bo_username, b.email_verified,
          COUNT(t.id)::int AS terminal_count
        FROM brands b
        LEFT JOIN terminal_registrations t ON t.brand_id = b.id AND t.active = true
        GROUP BY b.id ORDER BY b.created_at DESC`
      res.json({ ok: true, restaurants: rows.map(scrubBrand) })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: get single brand ──────────────────────────────────────────
  router.get('/restaurants/:id', jwtAuth, async (req, res) => {
    try {
      const [r] = await sql`SELECT * FROM brands WHERE id = ${req.params.id}`
      if (!r) return res.status(404).json({ error: 'Not found' })
      const [{ terminal_count }] = await sql`
        SELECT COUNT(*)::int AS terminal_count FROM terminal_registrations
        WHERE brand_id = ${req.params.id} AND active = true`
      res.json({ ok: true, restaurant: { ...decryptBrand(r), terminal_count } })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: regenerate license key ───────────────────────────────────
  router.post('/restaurants/:id/regenerate', jwtAuth, async (req, res) => {
    const { id } = req.params
    try {
      const [row] = await sql`SELECT id FROM brands WHERE id = ${id}`
      if (!row) return res.status(404).json({ error: 'Brand not found' })
      const newKey  = generateLicenseKey()
      const newHash = await hashLicenseKey(newKey)
      const prefix  = keyPrefix(newKey)
      await sql`UPDATE brands SET license_key_hash=${newHash}, license_prefix=${prefix} WHERE id=${id}`
      res.json({ ok: true, id, new_license_key: newKey, note: 'Save this license key — it is shown only once.' })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: update brand ──────────────────────────────────────────────
  router.patch('/restaurants/:id', jwtAuth, async (req, res) => {
    const { id } = req.params
    const {
      active, name, max_terminals, expires_days, notes, status, plan,
      extend_trial_days, reseller, last_billed_at,
      bo_username, bo_password, license_given_days,
    } = req.body || {}
    try {
      const updates = {}
      if (active          !== undefined) updates.active        = active
      if (name)                          updates.name          = name.trim()
      if (max_terminals)                 updates.max_terminals = parseInt(max_terminals, 10)
      if (notes           !== undefined) updates.notes         = notes
      if (status)                        updates.status        = status
      if (plan)                          updates.plan          = plan
      if (reseller        !== undefined) updates.reseller      = reseller || null
      if (last_billed_at  !== undefined) updates.last_billed_at = last_billed_at || null
      if (bo_username     !== undefined) updates.bo_username   = bo_username || null
      if (bo_password) {
        const hash   = await bcrypt.hash(bo_password, 10)
        const [boUser] = await sql`SELECT id FROM bo_users WHERE username = ${bo_username || ''}`
        if (boUser) await sql`UPDATE bo_users SET password = ${hash} WHERE username = ${bo_username || ''}`
      }
      if (expires_days)
        updates.expires_at = new Date(Date.now() + parseInt(expires_days, 10) * 86400000).toISOString()
      if (extend_trial_days) {
        const [row] = await sql`SELECT trial_ends_at FROM brands WHERE id = ${id}`
        const base = row && row.trial_ends_at && new Date(row.trial_ends_at) > new Date()
          ? new Date(row.trial_ends_at) : new Date()
        updates.trial_ends_at = new Date(base.getTime() + parseInt(extend_trial_days, 10) * 86400000).toISOString()
        updates.status = 'trial'
      }
      if (Object.keys(updates).length)
        await sql`UPDATE brands SET ${sql(updates)} WHERE id = ${id}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: delete brand + all data ───────────────────────────────────
  router.delete('/restaurants/:id', jwtAuth, async (req, res) => {
    const { id } = req.params
    try {
      const [r] = await sql`SELECT id, name FROM brands WHERE id = ${id}`
      if (!r) return res.status(404).json({ error: 'Brand not found' })

      const terminals = await sql`SELECT id FROM terminal_registrations WHERE brand_id = ${id}`
      const tids = terminals.map(t => t.id)

      if (tids.length > 0) {
        await sql`DELETE FROM order_items  WHERE order_id IN (SELECT id FROM orders WHERE terminal_id = ANY(${sql.array(tids)}))`
        await sql`DELETE FROM orders       WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM shifts       WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM expenses     WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM day_closings WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM audit_log    WHERE terminal_id = ANY(${sql.array(tids)})`
        await sql`DELETE FROM no_sale_log  WHERE terminal_id = ANY(${sql.array(tids)})`
      }

      await sql`DELETE FROM menu_items              WHERE brand_id = ${id}`
      await sql`DELETE FROM categories              WHERE brand_id = ${id}`
      await sql`DELETE FROM cashiers                WHERE brand_id = ${id}`
      await sql`DELETE FROM tables_layout           WHERE brand_id = ${id}`
      await sql`DELETE FROM customers               WHERE brand_id = ${id}`
      await sql`DELETE FROM bo_users                WHERE brand_id = ${id}`
      await sql`DELETE FROM terminal_registrations  WHERE brand_id = ${id}`
      await sql`DELETE FROM outlets                 WHERE brand_id = ${id}`
      await sql`DELETE FROM markets                 WHERE brand_id = ${id}`
      await sql`DELETE FROM brands                  WHERE id = ${id}`

      res.json({ ok: true, deleted: r.name })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: mark billed ───────────────────────────────────────────────
  router.post('/restaurants/:id/bill', jwtAuth, async (req, res) => {
    const { id } = req.params
    const { billed_at, extend_days } = req.body || {}
    try {
      const billedAt = billed_at ? new Date(billed_at).toISOString() : new Date().toISOString()
      const updates  = { last_billed_at: billedAt, status: 'active' }
      if (extend_days) {
        updates.expires_at        = new Date(Date.now() + parseInt(extend_days, 10) * 86400000).toISOString()
        updates.license_given_days = parseInt(extend_days, 10)
      }
      await sql`UPDATE brands SET ${sql(updates)} WHERE id = ${id}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: stats ─────────────────────────────────────────────────────
  router.get('/stats', jwtAuth, async (_req, res) => {
    try {
      const [totals] = await sql`
        SELECT
          COUNT(*)::int                                                                     AS total,
          COUNT(*) FILTER (WHERE status='trial')::int                                      AS trial,
          COUNT(*) FILTER (WHERE status='active')::int                                     AS active,
          COUNT(*) FILTER (WHERE status='expired')::int                                    AS expired,
          COUNT(*) FILTER (WHERE status='suspended')::int                                  AS suspended,
          COUNT(*) FILTER (WHERE to_timestamp(created_at/1000) > now()-interval '7 days')::int  AS new_7d,
          COUNT(*) FILTER (WHERE to_timestamp(created_at/1000) > now()-interval '30 days')::int AS new_30d,
          COUNT(*) FILTER (WHERE trial_ends_at < now()+interval '3 days'
            AND trial_ends_at > now() AND status='trial')::int                             AS expiring_3d
        FROM brands`

      const byCountry = await sql`
        SELECT country, COUNT(*)::int AS cnt FROM brands
        WHERE country IS NOT NULL GROUP BY country ORDER BY cnt DESC LIMIT 10`

      const byOnboarding = await sql`
        SELECT onboarding_step, COUNT(*)::int AS cnt FROM brands
        GROUP BY onboarding_step ORDER BY onboarding_step`

      const byReseller = await sql`
        SELECT COALESCE(reseller,'Direct') AS reseller, COUNT(*)::int AS cnt
        FROM brands GROUP BY reseller ORDER BY cnt DESC`

      const monthly = await sql`
        SELECT TO_CHAR(to_timestamp(created_at/1000),'YYYY-MM') AS month, COUNT(*)::int AS cnt
        FROM brands WHERE to_timestamp(created_at/1000) > now()-interval '6 months'
        GROUP BY month ORDER BY month`

      res.json({ ok: true, totals, byCountry, byOnboarding, byReseller, monthly })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: seed sample data for a specific outlet ───────────────────
  router.post('/outlets/:id/seed', jwtAuth, async (req, res) => {
    if (!req.user.admin) return res.status(403).json({ error: 'Superadmin only' })
    const outletId = req.params.id
    try {
      const [outlet] = await sql`SELECT * FROM outlets WHERE id = ${outletId}`
      if (!outlet) return res.status(404).json({ error: 'Outlet not found' })
      const bid = outlet.brand_id

      // Seed order types
      const orderTypes = [
        { name: 'Dine In',   icon: '🍽️', sort_order: 1 },
        { name: 'Takeaway',  icon: '🥡', sort_order: 2 },
        { name: 'Delivery',  icon: '🛵', sort_order: 3 },
      ]
      for (const ot of orderTypes) {
        const id = 'ot-' + uid()
        await sql`
          INSERT INTO order_types (id, brand_id, outlet_id, name, icon, enabled, sort_order)
          VALUES (${id}, ${bid}, ${outletId}, ${ot.name}, ${ot.icon}, true, ${ot.sort_order})
          ON CONFLICT DO NOTHING`
      }

      // Seed payment methods
      const payments = [
        { name: 'Cash',          type: 'cash',   sort_order: 1 },
        { name: 'Credit/Debit',  type: 'card',   sort_order: 2 },
        { name: 'QR Pay',        type: 'qr',     sort_order: 3 },
      ]
      for (const pm of payments) {
        const id = 'pm-' + uid()
        await sql`
          INSERT INTO payment_methods (id, brand_id, outlet_id, name, type, enabled, sort_order)
          VALUES (${id}, ${bid}, ${outletId}, ${pm.name}, ${pm.type}, true, ${pm.sort_order})
          ON CONFLICT DO NOTHING`
      }

      // Seed kitchens
      const kitchens = [
        { name: 'Main Kitchen', color: '#f97316' },
        { name: 'Bar',          color: '#6366f1' },
      ]
      for (const k of kitchens) {
        const id = 'kit-' + uid()
        await sql`
          INSERT INTO kitchens (id, brand_id, outlet_id, name, color, enabled, sort_order)
          VALUES (${id}, ${bid}, ${outletId}, ${k.name}, ${k.color}, true, 0)
          ON CONFLICT DO NOTHING`
      }

      // Seed tax group
      const taxId = 'tax-' + uid()
      await sql`
        INSERT INTO tax_groups (id, brand_id, outlet_id, name, rate, is_default)
        VALUES (${taxId}, ${bid}, ${outletId}, 'SST 6%', 6, true)
        ON CONFLICT DO NOTHING`

      // Seed designations
      const desig = [
        { name: 'Manager',  access_level: 3 },
        { name: 'Cashier',  access_level: 1 },
        { name: 'Waiter',   access_level: 1 },
      ]
      for (const d of desig) {
        const id = 'des-' + uid()
        await sql`
          INSERT INTO designations (id, brand_id, outlet_id, name, access_level)
          VALUES (${id}, ${bid}, ${outletId}, ${d.name}, ${d.access_level})
          ON CONFLICT DO NOTHING`
      }

      // Seed tables
      for (let i = 1; i <= 10; i++) {
        const id = 'tbl-' + uid()
        await sql`
          INSERT INTO tables_layout (id, brand_id, outlet_id, name, capacity, status)
          VALUES (${id}, ${bid}, ${outletId}, ${'Table ' + i}, 4, 'available')
          ON CONFLICT DO NOTHING`
      }

      // Seed menu categories + items
      const cats = [
        { name: 'Main Course', color: '#f97316', items: ['Nasi Lemak', 'Fried Rice', 'Grilled Chicken', 'Beef Rendang'] },
        { name: 'Beverages',   color: '#6366f1', items: ['Teh Tarik', 'Milo Ais', 'Fresh Lime', 'Iced Coffee'] },
        { name: 'Desserts',    color: '#ec4899', items: ['Cendol', 'Ice Cream', 'Kek Batik'] },
      ]
      for (let ci = 0; ci < cats.length; ci++) {
        const cat = cats[ci]
        const catId = 'cat-' + uid()
        await sql`
          INSERT INTO categories (id, brand_id, outlet_id, name, color, sort_order, active)
          VALUES (${catId}, ${bid}, ${outletId}, ${cat.name}, ${cat.color}, ${ci}, 1)
          ON CONFLICT DO NOTHING`
        for (let ii = 0; ii < cat.items.length; ii++) {
          const itemId = 'itm-' + uid()
          const price  = parseFloat((Math.random() * 15 + 5).toFixed(2))
          await sql`
            INSERT INTO menu_items (id, brand_id, outlet_id, category_id, name, price, active)
            VALUES (${itemId}, ${bid}, ${outletId}, ${catId}, ${cat.items[ii]}, ${price}, 1)
            ON CONFLICT DO NOTHING`
        }
      }

      // Seed default waiter/cashier staff (only if none exist for this brand with those roles)
      const [{ staff_count }] = await sql`
        SELECT COUNT(*)::int AS staff_count FROM cashiers
        WHERE brand_id = ${bid} AND role IN ('waiter','cashier') AND active = 1`
      if (staff_count === 0) {
        const defaultStaff = [
          { name: 'Cashier 1', pin: '1234', role: 'cashier' },
          { name: 'Cashier 2', pin: '2345', role: 'cashier' },
          { name: 'Waiter 1',  pin: '4444', role: 'waiter'  },
          { name: 'Waiter 2',  pin: '5555', role: 'waiter'  },
        ]
        for (const s of defaultStaff) {
          const sid = 'cash-' + uid()
          await sql`
            INSERT INTO cashiers (id, brand_id, outlet_id, name, pin, role, active, created_at)
            VALUES (${sid}, ${bid}, ${outletId}, ${s.name}, ${s.pin}, ${s.role}, 1, ${Date.now()})
            ON CONFLICT DO NOTHING`
        }
      }

      res.json({ ok: true, message: `Sample data seeded for outlet: ${outlet.name}` })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: seed historical orders for a specific outlet ─────────────
  router.post('/outlets/:id/seed-orders', jwtAuth, async (req, res) => {
    const outletId = req.params.id
    const { days = 30, from_days_ago, to_days_ago } = req.body || {}
    const startDay = from_days_ago !== undefined ? parseInt(from_days_ago) : parseInt(days)
    const endDay   = to_days_ago   !== undefined ? parseInt(to_days_ago)   : 1
    try {
      const [outlet] = await sql`SELECT * FROM outlets WHERE id = ${outletId}`
      if (!outlet) return res.status(404).json({ error: 'Outlet not found' })
      const bid = outlet.brand_id
      // Allow admin OR BO user who owns this brand
      if (!req.user.admin && req.user.brand_id !== bid)
        return res.status(403).json({ error: 'Not authorized' })

      const items = await sql`SELECT id, name, price FROM menu_items WHERE brand_id = ${bid} AND outlet_id = ${outletId} AND active = 1`
      if (!items.length) return res.status(400).json({ error: 'No menu items found — run /seed first' })

      const payMethods  = ['cash','cash','cash','card','card','ewallet']
      const orderTypes  = ['dine-in','dine-in','dine-in','takeaway','takeaway','delivery']
      const staffNames  = ['Ahmad','Suraya','Hafiz','Nadia']

      let totalOrders = 0

      for (let d = startDay; d >= endDay; d--) {
        const dayStart = new Date()
        dayStart.setHours(0, 0, 0, 0)
        dayStart.setDate(dayStart.getDate() - d)
        const dateStr = dayStart.toISOString().split('T')[0]

        const shifts = [
          { start: new Date(dayStart.getTime() + 7 * 3600000), end: new Date(dayStart.getTime() + 15 * 3600000), cashier: staffNames[0] },
          { start: new Date(dayStart.getTime() + 15 * 3600000), end: new Date(dayStart.getTime() + 23 * 3600000), cashier: staffNames[1] },
        ]

        for (const sh of shifts) {
          const shiftId  = crypto.randomUUID()
          await sql`
            INSERT INTO shifts (id, brand_id, outlet_id, cashier_id, cashier_name, opening_cash, status, terminal_id, opened_at, closed_at, synced)
            VALUES (${shiftId}, ${bid}, ${outletId}, ${sh.cashier}, ${sh.cashier}, 300, 'closed', 'POS-SEED', ${sh.start.getTime()}, ${sh.end.getTime()}, 1)
            ON CONFLICT (id) DO NOTHING`

          const isEvening  = sh.start.getHours() >= 15
          const orderCount = isEvening ? 10 + Math.floor(Math.random() * 8) : 5 + Math.floor(Math.random() * 6)

          for (let o = 0; o < orderCount; o++) {
            const orderId   = crypto.randomUUID()
            const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)]
            const payMethod = payMethods[Math.floor(Math.random() * payMethods.length)]
            const createdAt = sh.start.getTime() + Math.floor(Math.random() * (sh.end.getTime() - sh.start.getTime()))
            const outPfx    = outletId.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase()
            const orderNum  = `${outPfx}-${dateStr.replace(/-/g, '')}-${String(totalOrders + 1).padStart(4, '0')}`

            const picked = shuffleArr([...items]).slice(0, 1 + Math.floor(Math.random() * 4))
            let subtotal = 0
            const orderItems = picked.map(item => {
              const qty   = 1 + Math.floor(Math.random() * 3)
              const total = parseFloat((item.price * qty).toFixed(2))
              subtotal   += total
              return { id: crypto.randomUUID(), orderId, itemId: item.id, name: item.name, qty, price: item.price, total }
            })
            subtotal = parseFloat(subtotal.toFixed(2))

            const taxRate = 6
            const taxAmt  = parseFloat((subtotal * taxRate / 100).toFixed(2))
            let discType = 'none', discVal = 0, discAmt = 0
            if (Math.random() < 0.12) {
              discType = 'percent'; discVal = [5, 10, 15][Math.floor(Math.random() * 3)]
              discAmt  = parseFloat((subtotal * discVal / 100).toFixed(2))
            }
            const total    = parseFloat((subtotal + taxAmt - discAmt).toFixed(2))
            const received = payMethod === 'cash' ? Math.ceil(total / 10) * 10 : total
            const change   = parseFloat((received - total).toFixed(2))

            await sql`
              INSERT INTO orders (id, brand_id, outlet_id, order_number, order_type, status,
                subtotal, tax_rate, tax_amount, discount_type, discount_value, discount_amount,
                total, payment_method, payment_received, change_amount,
                cashier_id, cashier_name, shift_id, terminal_id, created_at, updated_at, billed_at, synced)
              VALUES (${orderId}, ${bid}, ${outletId}, ${orderNum}, ${orderType}, 'paid',
                ${subtotal}, ${taxRate}, ${taxAmt}, ${discType}, ${discVal}, ${discAmt},
                ${total}, ${payMethod}, ${received}, ${change},
                ${sh.cashier}, ${sh.cashier}, ${shiftId}, 'POS-SEED',
                ${createdAt}, ${createdAt}, ${createdAt}, 1)
              ON CONFLICT DO NOTHING`

            for (const i of orderItems)
              await sql`
                INSERT INTO order_items (id, order_id, item_id, item_name, quantity, unit_price, total_price)
                VALUES (${i.id}, ${i.orderId}, ${i.itemId}, ${i.name}, ${i.qty}, ${i.price}, ${i.total})
                ON CONFLICT (id) DO NOTHING`

            totalOrders++
          }
        }
      }

      res.json({ ok: true, message: `Seeded ${totalOrders} orders for outlet: ${outlet.name}`, total_orders: totalOrders })
    } catch (e) { serverError(res, e) }
  })

  // ── Clear all categories + items for a specific outlet ───────────────────
  router.delete('/outlets/:id/menu', jwtAuth, async (req, res) => {
    const outletId = req.params.id
    try {
      const [outlet] = await sql`SELECT * FROM outlets WHERE id = ${outletId}`
      if (!outlet) return res.status(404).json({ error: 'Outlet not found' })
      const bid = outlet.brand_id
      if (!req.user.admin && req.user.brand_id !== bid)
        return res.status(403).json({ error: 'Not authorized' })

      const items = await sql`SELECT id FROM menu_items WHERE brand_id = ${bid} AND outlet_id = ${outletId}`
      const itemIds = items.map(i => i.id)

      if (itemIds.length) {
        await sql`DELETE FROM item_modifier_groups WHERE item_id = ANY(${sql.array(itemIds)})`
        await sql`DELETE FROM item_variants WHERE item_id = ANY(${sql.array(itemIds)})`
        await sql`DELETE FROM menu_items WHERE brand_id = ${bid} AND outlet_id = ${outletId}`
      }
      await sql`DELETE FROM categories WHERE brand_id = ${bid} AND outlet_id = ${outletId}`

      res.json({ ok: true, deleted_items: itemIds.length, outlet: outlet.name })
    } catch (e) { serverError(res, e) }
  })

  // ── Seed custom menu for a specific outlet ───────────────────────────────
  // Body: { categories: [{ name, color, items: [{ name, price }] }] }
  router.post('/outlets/:id/seed-menu', jwtAuth, async (req, res) => {
    const outletId = req.params.id
    const { categories = [] } = req.body || {}
    if (!categories.length) return res.status(400).json({ error: 'categories array required' })
    try {
      const [outlet] = await sql`SELECT * FROM outlets WHERE id = ${outletId}`
      if (!outlet) return res.status(404).json({ error: 'Outlet not found' })
      const bid = outlet.brand_id
      if (!req.user.admin && req.user.brand_id !== bid)
        return res.status(403).json({ error: 'Not authorized' })

      let catCount = 0, itemCount = 0
      for (let ci = 0; ci < categories.length; ci++) {
        const cat   = categories[ci]
        const catId = 'cat-' + uid()
        await sql`
          INSERT INTO categories (id, brand_id, outlet_id, name, color, sort_order, active)
          VALUES (${catId}, ${bid}, ${outletId}, ${cat.name}, ${cat.color || '#f97316'}, ${ci}, 1)
          ON CONFLICT DO NOTHING`
        catCount++
        for (const itm of (cat.items || [])) {
          const itemId = 'itm-' + uid()
          const name   = typeof itm === 'object' ? itm.name  : String(itm)
          const price  = typeof itm === 'object' ? itm.price : parseFloat(itm)
          await sql`
            INSERT INTO menu_items (id, brand_id, outlet_id, category_id, name, price, active)
            VALUES (${itemId}, ${bid}, ${outletId}, ${catId}, ${name}, ${price}, 1)
            ON CONFLICT DO NOTHING`
          itemCount++
        }
      }
      res.json({ ok: true, categories: catCount, items: itemCount, outlet: outlet.name })
    } catch (e) { serverError(res, e) }
  })

  // ── Public: look up outlet by code. brand_id required; outlet_id optional but
  //    matched when provided (POS sends all three for anti-guessing security;
  //    KDS/waiter/delivery send only brand_id + code). ──
  router.post('/by-code', async (req, res) => {
    const raw      = (req.body?.code      || '').replace(/\s/g, '')
    const brandId  = (req.body?.brand_id  || '').trim()
    const outletId = (req.body?.outlet_id || '').trim()
    if (!brandId)         return res.status(400).json({ error: 'Brand ID is required', code: 'MISSING_BRAND' })
    if (raw.length !== 6) return res.status(400).json({ error: 'Outlet code must be exactly 6 characters', code: 'INVALID_CODE' })
    try {
      const [outlet] = outletId
        ? await sql`
            SELECT o.id, o.name, o.outlet_code, o.brand_id, b.name AS brand_name
            FROM outlets o JOIN brands b ON b.id = o.brand_id
            WHERE LOWER(o.outlet_code) = LOWER(${raw}) AND o.brand_id = ${brandId} AND o.id = ${outletId}`
        : await sql`
            SELECT o.id, o.name, o.outlet_code, o.brand_id, b.name AS brand_name
            FROM outlets o JOIN brands b ON b.id = o.brand_id
            WHERE LOWER(o.outlet_code) = LOWER(${raw}) AND o.brand_id = ${brandId}`
      if (!outlet) return res.status(404).json({ error: 'Outlet details do not match. Check Brand ID, Outlet ID and Outlet Code.', code: 'NOT_FOUND' })
      res.json({ outlet_id: outlet.id, outlet_name: outlet.name, outlet_code: outlet.outlet_code, brand_id: outlet.brand_id, brand_name: outlet.brand_name })
    } catch (e) { serverError(res, e) }
  })

  // ── Public: POS terminal registers using brand_id + outlet code (replaces /connect for new installs) ──
  router.post('/connect-code', async (req, res) => {
    const raw      = (req.body?.outlet_code || '').replace(/\s/g, '')
    const brandId  = (req.body?.brand_id    || '').trim()
    const outletId = (req.body?.outlet_id   || '').trim()
    const { machine_id } = req.body || {}
    // Terminal registration requires all three for anti-guessing security.
    if (!brandId)         return res.status(400).json({ error: 'Brand ID is required', code: 'MISSING_BRAND' })
    if (!outletId)        return res.status(400).json({ error: 'Outlet ID is required', code: 'MISSING_OUTLET' })
    if (raw.length !== 6) return res.status(400).json({ error: 'Outlet code must be exactly 6 characters', code: 'INVALID_CODE' })
    try {
      const [outlet] = await sql`
        SELECT o.*, b.name AS brand_name, b.active AS brand_active, b.expires_at, b.max_terminals
        FROM outlets o JOIN brands b ON b.id = o.brand_id
        WHERE LOWER(o.outlet_code) = LOWER(${raw}) AND o.brand_id = ${brandId} AND o.id = ${outletId}`
      if (!outlet) return res.status(404).json({ error: 'Outlet details do not match. Check Brand ID, Outlet ID and Outlet Code.', code: 'NOT_FOUND' })
      if (!outlet.brand_active) return res.status(403).json({ error: 'Brand license is deactivated.', code: 'DEACTIVATED' })
      if (isExpired(outlet.expires_at)) return res.status(403).json({ error: 'License has expired. Contact your provider.', code: 'EXPIRED' })

      const brand_id = outlet.brand_id
      const mid = (machine_id || '').trim() || generateMachineId()
      const [existingTerm] = await sql`SELECT id FROM terminal_registrations WHERE brand_id = ${brand_id} AND machine_id = ${mid}`

      const { randomBytes } = require('crypto')
      const tkPrefix = randomBytes(6).toString('hex')
      const tkSecret = randomBytes(24).toString('base64url')
      const tkRaw    = `${tkPrefix}.${tkSecret}`
      const tkHash   = await bcrypt.hash(tkSecret, 10)

      let terminalId
      if (existingTerm) {
        terminalId = existingTerm.id
        await sql`UPDATE terminal_registrations SET last_seen=now(), active=true, outlet_id=${outlet.id}, api_key_prefix=${tkPrefix}, api_key_hash=${tkHash}, revoked_at=NULL WHERE id=${existingTerm.id}`
      } else {
        const [{ cnt }] = await sql`SELECT COUNT(*)::int AS cnt FROM terminal_registrations WHERE brand_id=${brand_id} AND active=true`
        if (cnt >= (outlet.max_terminals || 99))
          return res.status(403).json({ error: `Terminal limit reached (${outlet.max_terminals}).`, code: 'TERMINAL_LIMIT' })
        terminalId = `${brand_id}-${mid}-${Date.now().toString(36)}`
        await sql`INSERT INTO terminal_registrations (id, brand_id, machine_id, outlet_id, last_seen, active, api_key_prefix, api_key_hash) VALUES (${terminalId}, ${brand_id}, ${mid}, ${outlet.id}, now(), true, ${tkPrefix}, ${tkHash})`
      }

      res.json({
        ok: true, terminal_id: terminalId, api_key: tkRaw,
        brand_id, brand_name: outlet.brand_name,
        outlet_id: outlet.id, outlet_name: outlet.name, outlet_code: outlet.outlet_code,
        restaurant: { id: brand_id, name: outlet.brand_name },
        // DB connection details so the POS auto-configures local mode (no manual entry).
        // host is omitted on purpose — the POS uses the server IP it connected to.
        db: {
          port:     process.env.DB_PORT || '5432',
          database: process.env.DB_NAME || 'restaurant_pos_central',
          user:     process.env.DB_USER || 'pos_central_user',
          password: process.env.DB_PASS || '',
        },
      })
    } catch (e) { serverError(res, e) }
  })

  // ── Public: POS terminal connects ────────────────────────────────────────
  // Accepts brand_id (new) or restaurant_id (legacy alias)
  router.post('/connect', async (req, res) => {
    const brand_id = req.body?.brand_id || req.body?.restaurant_id
    const { license_key, machine_id, outlet_id } = req.body || {}
    if (!brand_id || !license_key)
      return res.status(400).json({ error: 'brand_id and license_key are required', code: 'MISSING_CREDENTIALS' })

    try {
      const [brand] = await sql`SELECT * FROM brands WHERE id = ${brand_id}`
      if (!brand)
        return res.status(401).json({ error: 'Brand ID not found. Check your Brand ID.', code: 'INVALID_ID' })
      if (!brand.active)
        return res.status(403).json({ error: 'This brand license has been deactivated.', code: 'DEACTIVATED' })
      if (isExpired(brand.expires_at))
        return res.status(403).json({ error: 'License has expired. Contact your provider to renew.', code: 'EXPIRED' })

      const valid = await verifyLicenseKey(license_key, brand.license_key_hash)
      if (!valid)
        return res.status(401).json({ error: 'Invalid License Key.', code: 'INVALID_KEY' })

      let outlet = null
      if (outlet_id) {
        const [o] = await sql`SELECT * FROM outlets WHERE id = ${outlet_id} AND brand_id = ${brand_id}`
        if (!o)
          return res.status(404).json({ error: 'Outlet ID not found.', code: 'INVALID_OUTLET' })
        if (o.license_end_date && new Date(o.license_end_date) < new Date())
          return res.status(403).json({ error: 'Outlet license has expired.', code: 'OUTLET_EXPIRED' })
        outlet = o
      }

      const mid = (machine_id || '').trim() || generateMachineId()
      const [existingTerm] = await sql`
        SELECT id FROM terminal_registrations
        WHERE brand_id = ${brand_id} AND machine_id = ${mid}`

      // Per-terminal API key: <prefix>.<secret>. Prefix stored plaintext for
      // lookup; secret stored as bcrypt hash. Raw key returned to client once.
      const { randomBytes } = require('crypto')
      const tkPrefix = randomBytes(6).toString('hex')                 // 12 chars
      const tkSecret = randomBytes(24).toString('base64url')          // ~32 chars
      const tkRaw    = `${tkPrefix}.${tkSecret}`
      const tkHash   = await bcrypt.hash(tkSecret, 10)

      let terminalId
      if (existingTerm) {
        terminalId = existingTerm.id
        await sql`
          UPDATE terminal_registrations
          SET last_seen=now(), active=true, outlet_id=${outlet_id || null},
              api_key_prefix=${tkPrefix}, api_key_hash=${tkHash}, revoked_at=NULL
          WHERE id=${existingTerm.id}`
      } else {
        const [{ cnt }] = await sql`
          SELECT COUNT(*)::int AS cnt FROM terminal_registrations
          WHERE brand_id=${brand_id} AND active=true`
        if (cnt >= brand.max_terminals)
          return res.status(403).json({
            error: `Terminal limit reached (${brand.max_terminals}).`,
            code: 'TERMINAL_LIMIT',
          })
        terminalId = `${brand_id}-${mid}-${Date.now().toString(36)}`
        await sql`
          INSERT INTO terminal_registrations
            (id, brand_id, machine_id, outlet_id, last_seen, api_key_prefix, api_key_hash)
          VALUES
            (${terminalId}, ${brand_id}, ${mid}, ${outlet_id || null}, now(), ${tkPrefix}, ${tkHash})`
      }

      res.json({
        ok: true,
        machine_id:  mid,
        terminal_id: terminalId,
        brand: { id: brand.id, name: brand.name },
        restaurant: { id: brand.id, name: brand.name }, // legacy alias
        outlet: outlet ? { id: outlet.id, name: outlet.name } : null,
        api_key: tkRaw,                  // per-terminal key — store on client, never sent again
      })
    } catch (e) { res.status(500).json({ error: e.message, code: 'SERVER_ERROR' }) }
  })

  // ── Public: validate license ──────────────────────────────────────────────
  router.post('/validate', async (req, res) => {
    const brand_id = req.body?.brand_id || req.body?.restaurant_id
    const { license_key } = req.body || {}
    if (!brand_id || !license_key)
      return res.status(400).json({ error: 'Missing credentials', code: 'MISSING' })
    try {
      const [brand] = await sql`SELECT * FROM brands WHERE id = ${brand_id}`
      if (!brand) return res.json({ ok: false, code: 'INVALID_ID', error: 'Brand ID not found' })
      if (!brand.active) return res.json({ ok: false, code: 'DEACTIVATED', error: 'License deactivated' })
      if (isExpired(brand.expires_at)) return res.json({ ok: false, code: 'EXPIRED', error: 'License expired' })
      const valid = await verifyLicenseKey(license_key, brand.license_key_hash)
      if (!valid) return res.json({ ok: false, code: 'INVALID_KEY', error: 'Invalid license key' })
      res.json({ ok: true, brand: { id: brand.id, name: brand.name }, expires_at: brand.expires_at })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: all markets ───────────────────────────────────────────────
  router.get('/markets', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`
        SELECT m.*, b.name AS brand_name
        FROM markets m
        LEFT JOIN brands b ON b.id = m.brand_id
        ORDER BY b.name, m.name`
      res.json({ ok: true, markets: rows })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: all outlets ───────────────────────────────────────────────
  router.get('/outlets', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`
        SELECT o.*, b.name AS brand_name, m.name AS market_name
        FROM outlets o
        LEFT JOIN brands b  ON b.id = o.brand_id
        LEFT JOIN markets m ON m.id = o.market_id
        ORDER BY o.created_at DESC`
      res.json({ ok: true, outlets: rows })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: update outlet license date ────────────────────────────────
  router.patch('/outlets/:id', jwtAuth, async (req, res) => {
    const { license_end_date } = req.body || {}
    try {
      await sql`UPDATE outlets SET license_end_date = ${license_end_date || null} WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── Auto-detect: localhost-only, returns outlets + api_key for POS first-time setup ──
  router.get('/auto-detect', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || ''
    const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) || ip === 'localhost'
    if (!isLocal) return res.status(403).json({ error: 'Auto-detect only available from localhost' })
    try {
      const outlets = await sql`
        SELECT o.id, o.name, o.brand_id, o.outlet_code,
               b.name AS brand_name,
               m.name AS market_name
        FROM outlets o
        JOIN brands b ON b.id = o.brand_id
        JOIN markets m ON m.id = o.market_id
        WHERE b.active = true
        ORDER BY b.name, m.name, o.name`
      // Return DB connection info so POS can connect directly
      let db = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'restaurant_pos_central',
        user: process.env.DB_USER || 'pos_central_user',
        password: process.env.DB_PASS || '',
        ssl: 'false',
      }
      if (process.env.DATABASE_URL) {
        try {
          const u = new URL(process.env.DATABASE_URL)
          db = { host: u.hostname, port: parseInt(u.port || '5432', 10),
                 database: u.pathname.replace(/^\//, ''), user: u.username,
                 password: u.password, ssl: 'true' }
        } catch (_) {}
      }
      res.json({ ok: true, outlets, api_key: process.env.API_KEY || '', db })
    } catch (e) { serverError(res, e) }
  })

  // ── Superadmin: terminals for a brand ────────────────────────────────────
  router.get('/restaurants/:id/terminals', jwtAuth, async (req, res) => {
    try {
      const rows = await sql`
        SELECT * FROM terminal_registrations
        WHERE brand_id = ${req.params.id}
        ORDER BY registered_at DESC`
      res.json({ ok: true, terminals: rows })
    } catch (e) { serverError(res, e) }
  })

  router.delete('/terminals/:id', jwtAuth, async (req, res) => {
    try {
      await sql`UPDATE terminal_registrations SET active=false WHERE id=${req.params.id}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── Global payment methods ────────────────────────────────────────────────
  router.get('/global-payment-methods', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`SELECT * FROM global_payment_methods ORDER BY sort_order, name`
      res.json({ ok: true, rows })
    } catch (e) { serverError(res, e) }
  })

  router.post('/global-payment-methods', jwtAuth, async (req, res) => {
    const { name, icon, type } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    try {
      const id = 'gpm-' + uid()
      const [row] = await sql`
        INSERT INTO global_payment_methods (id, name, icon, type, sort_order)
        VALUES (${id}, ${name.trim()}, ${icon || '💳'}, ${type || 'other'},
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM global_payment_methods))
        RETURNING *`
      res.json({ ok: true, row })
    } catch (e) { serverError(res, e) }
  })

  router.patch('/global-payment-methods/:id', jwtAuth, async (req, res) => {
    const { name, icon, type, active } = req.body || {}
    try {
      const [row] = await sql`
        UPDATE global_payment_methods SET
          name   = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          icon   = COALESCE(NULLIF(${icon || ''}, ''), icon),
          type   = COALESCE(NULLIF(${type || ''}, ''), type),
          active = COALESCE(${active !== undefined ? !!active : null}, active)
        WHERE id = ${req.params.id} RETURNING *`
      if (!row) return res.status(404).json({ error: 'Not found' })
      res.json({ ok: true, row })
    } catch (e) { serverError(res, e) }
  })

  router.delete('/global-payment-methods/:id', jwtAuth, async (req, res) => {
    try {
      await sql`DELETE FROM outlet_hidden_payments WHERE method_id = ${req.params.id}`
      await sql`DELETE FROM global_payment_methods WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── Global delivery partners ──────────────────────────────────────────────
  router.get('/global-delivery-partners', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`SELECT * FROM global_delivery_partners ORDER BY sort_order, name`
      res.json({ ok: true, rows })
    } catch (e) { serverError(res, e) }
  })

  router.post('/global-delivery-partners', jwtAuth, async (req, res) => {
    const { name, logo_url, commission_pct } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    try {
      const id = 'gdp-' + uid()
      const [row] = await sql`
        INSERT INTO global_delivery_partners (id, name, logo_url, commission_pct, sort_order)
        VALUES (${id}, ${name.trim()}, ${logo_url || null}, ${parseFloat(commission_pct) || 0},
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM global_delivery_partners))
        RETURNING *`
      res.json({ ok: true, row })
    } catch (e) { serverError(res, e) }
  })

  router.patch('/global-delivery-partners/:id', jwtAuth, async (req, res) => {
    const { name, logo_url, commission_pct, active } = req.body || {}
    try {
      const [row] = await sql`
        UPDATE global_delivery_partners SET
          name           = COALESCE(NULLIF(${(name || '').trim()}, ''), name),
          logo_url       = COALESCE(NULLIF(${logo_url || ''}, ''), logo_url),
          commission_pct = COALESCE(${commission_pct !== undefined ? parseFloat(commission_pct) : null}, commission_pct),
          active         = COALESCE(${active !== undefined ? !!active : null}, active)
        WHERE id = ${req.params.id} RETURNING *`
      if (!row) return res.status(404).json({ error: 'Not found' })
      res.json({ ok: true, row })
    } catch (e) { serverError(res, e) }
  })

  router.delete('/global-delivery-partners/:id', jwtAuth, async (req, res) => {
    try {
      await sql`DELETE FROM outlet_hidden_partners WHERE partner_id = ${req.params.id}`
      await sql`DELETE FROM global_delivery_partners WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── CLOUD side: validate the (brand_id, outlet_id, outlet_code) triple and
  //    return ONLY that outlet's data. Protected by api key (the local server
  //    authenticates with CLOUD_SYNC_KEY). The central DB may hold thousands of
  //    outlets — this returns just this one. ──
  router.post('/provision', apiKey, async (req, res) => {
    const brandId  = (req.body?.brand_id    || '').trim()
    const outletId = (req.body?.outlet_id   || '').trim()
    const raw      = (req.body?.outlet_code || '').replace(/\s/g, '')
    if (!brandId || !outletId || raw.length !== 6)
      return res.status(400).json({ error: 'brand_id, outlet_id and a 6-character outlet_code are all required', code: 'BAD_INPUT' })
    try {
      const [outlet] = await sql`
        SELECT o.id, o.brand_id, o.name, o.phone, o.email, o.address, o.opening_time, o.closing_time,
               o.currency, o.currency_code, o.currency_symbol, o.market_id, o.outlet_code, o.country,
               b.name AS brand_name, b.active AS brand_active, b.expires_at
        FROM outlets o JOIN brands b ON b.id = o.brand_id
        WHERE LOWER(o.outlet_code) = LOWER(${raw}) AND o.brand_id = ${brandId} AND o.id = ${outletId}`
      if (!outlet) return res.status(404).json({ error: 'Outlet details do not match. Check Brand ID, Outlet ID and Outlet Code.', code: 'NOT_FOUND' })
      if (outlet.brand_active === false) return res.status(403).json({ error: 'Brand license is deactivated.', code: 'DEACTIVATED' })
      if (isExpired(outlet.expires_at)) return res.status(403).json({ error: 'License has expired. Contact your provider.', code: 'EXPIRED' })

      // Brand-shared config (menu, staff) + outlet-specific data (tables, settings).
      const [brand] = await sql`SELECT id, name, business_type, country, active FROM brands WHERE id = ${brandId}`
      const markets = await sql`SELECT id, name, brand_id, country, currency_code, currency_symbol, created_at FROM markets WHERE brand_id = ${brandId}`
      const categories = await sql`
        SELECT id, name, sort_order, color, active, synced_at, kitchen_id, outlet_id, brand_id
        FROM categories WHERE brand_id = ${brandId}`
      const menu_items = await sql`
        SELECT id, category_id, name, price, description, active, synced_at, brand_id, outlet_id, kitchen_id,
               dine_in_price, takeaway_price, delivery_price, online_price
        FROM menu_items WHERE brand_id = ${brandId}`
      const cashiers = await sql`
        SELECT id, name, pin, pin_hash, role, active, synced, created_at, outlet_id, brand_id
        FROM cashiers WHERE brand_id = ${brandId} AND (outlet_id = ${outletId} OR outlet_id IS NULL)`
      const tables_layout = await sql`
        SELECT id, name, capacity, status, current_order_id, locked_by, outlet_id, seat_count, section_name, section_id, brand_id
        FROM tables_layout WHERE outlet_id = ${outletId}`
      const settings = await sql`
        SELECT key, value, brand_id, outlet_id
        FROM settings WHERE brand_id = ${brandId} AND (outlet_id = ${outletId} OR outlet_id = '')`

      const { brand_active, expires_at, brand_name, ...outletRow } = outlet
      res.json({
        ok: true,
        brand: brand || { id: brandId, name: brand_name },
        markets,
        outlet: outletRow,
        categories, menu_items, cashiers, tables_layout, settings,
      })
    } catch (e) { serverError(res, e) }
  })

  // ── LOCAL side: orchestrates cloud-validate → fetch this outlet's data →
  //    seed it into the local DB → register this terminal. Called by the POS. ──
  router.post('/provision-local', async (req, res) => {
    const brandId  = (req.body?.brand_id    || '').trim()
    const outletId = (req.body?.outlet_id   || '').trim()
    const code     = (req.body?.outlet_code || '').replace(/\s/g, '')
    const machineId = req.body?.machine_id
    if (!brandId)          return res.status(400).json({ error: 'Brand ID is required', code: 'MISSING_BRAND' })
    if (!outletId)         return res.status(400).json({ error: 'Outlet ID is required', code: 'MISSING_OUTLET' })
    if (code.length !== 6) return res.status(400).json({ error: 'Outlet code must be exactly 6 characters', code: 'INVALID_CODE' })

    const cloudUrl = (process.env.CLOUD_SYNC_URL || '').replace(/\/+$/, '')
    const cloudKey = process.env.CLOUD_SYNC_KEY || process.env.API_KEY || ''
    if (!cloudUrl) return res.status(503).json({ error: 'Cloud is not configured on this server.', code: 'NO_CLOUD' })

    try {
      // 1) Validate + fetch this outlet's data from the central cloud
      let data
      try {
        const r = await fetch(cloudUrl + '/setup/provision', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': cloudKey },
          body:    JSON.stringify({ brand_id: brandId, outlet_id: outletId, outlet_code: code }),
          signal:  AbortSignal.timeout(25_000),
        })
        data = await r.json().catch(() => ({}))
        if (!r.ok) return res.status(r.status).json({ error: data.error || 'Cloud rejected the outlet', code: data.code || 'CLOUD_REJECTED' })
      } catch (e) {
        return res.status(502).json({ error: 'Cannot reach the cloud to validate this outlet: ' + e.message, code: 'CLOUD_UNREACHABLE' })
      }
      if (!data.ok || !data.outlet) return res.status(404).json({ error: 'Outlet not found in cloud.', code: 'NOT_FOUND' })

      // 2) Seed ONLY this outlet's data into the local database
      const seeded = await seedOutletData(sql, data)

      // 3) Register this terminal locally
      const [localOutlet] = await sql`SELECT id, brand_id, name, outlet_code FROM outlets WHERE id = ${outletId}`
      if (!localOutlet) return res.status(500).json({ error: 'Seeding failed — outlet not present locally after provisioning.', code: 'SEED_FAILED' })
      const { terminalId, apiKey: tkRaw } = await registerTerminal(sql, localOutlet, machineId)

      res.json({
        ok: true, terminal_id: terminalId, api_key: tkRaw,
        brand_id: brandId, brand_name: data.brand?.name || '',
        outlet_id: outletId, outlet_name: data.outlet?.name, outlet_code: data.outlet?.outlet_code,
        seeded,
        db: {
          port:     process.env.DB_PORT || '5432',
          database: process.env.DB_NAME || 'restaurant_pos_central',
          user:     process.env.DB_USER || 'pos_central_user',
          password: process.env.DB_PASS || '',
        },
      })
    } catch (e) { serverError(res, e) }
  })

  // ── LOCAL side: lightweight "Verify" — proxies validation to the CLOUD (a new
  //    outlet may exist only in the cloud, not yet locally). Returns outlet name
  //    so the setup screen can confirm before the heavier provision step. ──
  router.post('/cloud-verify', async (req, res) => {
    const brandId  = (req.body?.brand_id    || '').trim()
    const outletId = (req.body?.outlet_id   || '').trim()
    const code     = (req.body?.outlet_code || '').replace(/\s/g, '')
    if (!brandId)          return res.status(400).json({ error: 'Brand ID is required', code: 'MISSING_BRAND' })
    if (!outletId)         return res.status(400).json({ error: 'Outlet ID is required', code: 'MISSING_OUTLET' })
    if (code.length !== 6) return res.status(400).json({ error: 'Outlet code must be exactly 6 characters', code: 'INVALID_CODE' })

    const cloudUrl = (process.env.CLOUD_SYNC_URL || '').replace(/\/+$/, '')
    const cloudKey = process.env.CLOUD_SYNC_KEY || process.env.API_KEY || ''
    if (!cloudUrl) return res.status(503).json({ error: 'Cloud is not configured on this server.', code: 'NO_CLOUD' })

    try {
      const r = await fetch(cloudUrl + '/setup/by-code', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': cloudKey },
        body:    JSON.stringify({ code, brand_id: brandId, outlet_id: outletId }),
        signal:  AbortSignal.timeout(20_000),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) return res.status(r.status).json({ error: d.error || 'Outlet not found in cloud', code: d.code || 'NOT_FOUND' })
      res.json(d)
    } catch (e) {
      return res.status(502).json({ error: 'Cannot reach the cloud to verify this outlet: ' + e.message, code: 'CLOUD_UNREACHABLE' })
    }
  })

  return router
}

function shuffleArr (arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
