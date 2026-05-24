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

function decryptBrand (r) {
  return {
    ...r,
    license_key:    safeDecrypt(r.license_key_enc),
    bo_password:    safeDecrypt(r.bo_password_enc),
    license_key_enc: undefined,
    bo_password_enc: undefined,
  }
}

function uid () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

module.exports = function setupRouter (sql) {
  const router = express.Router()

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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Superadmin: register new brand ────────────────────────────────────────
  router.post('/register', jwtAuth, async (req, res) => {
    const {
      name, max_terminals = 10, expires_days, notes, reseller_name,
      business_type, country,
      owner_name, owner_mobile, email, whatsapp,
      outlet_name, outlet_phone, outlet_email, address,
      google_map_url, opening_time, closing_time,
      order_types_list, delivery_aggregators, table_count,
    } = req.body || {}
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' })

    try {
      const bcrypt     = require('bcryptjs')
      const id         = generateRestaurantId()
      const licenseKey = generateLicenseKey()
      const keyHash    = await hashLicenseKey(licenseKey)
      const prefix     = keyPrefix(licenseKey)
      const keyEnc     = encryptText(licenseKey)
      const givenDays  = expires_days ? parseInt(expires_days, 10) : null
      const expiresAt  = givenDays ? new Date(Date.now() + givenDays * 86400000).toISOString() : null
      const licStartAt = new Date().toISOString()

      const boUsername = (name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'admin') +
                         Math.floor(Math.random() * 900 + 100)
      const boPassword = Math.random().toString(36).slice(2, 8).toUpperCase() +
                         Math.floor(Math.random() * 90 + 10) + '!'
      const boPassEnc  = encryptText(boPassword)
      const boPassHash = await bcrypt.hash(boPassword, 10)

      await sql`
        INSERT INTO brands (
          id, name, license_key_hash, license_prefix, license_key_enc,
          max_terminals, expires_at, notes, active,
          business_type, country, owner_name, email, phone,
          bo_username, bo_password_enc, signup_source, status, plan
        ) VALUES (
          ${id}, ${name.trim()}, ${keyHash}, ${prefix}, ${keyEnc},
          ${max_terminals}, ${expiresAt}, ${notes || null}, ${true},
          ${business_type || null}, ${country || 'Malaysia'}, ${owner_name || null},
          ${email || null}, ${owner_mobile || null},
          ${boUsername}, ${boPassEnc}, 'admin_panel', 'active', 'paid'
        )`

      // Create BO owner user
      const boId = uid()
      await sql`
        INSERT INTO bo_users (id, brand_id, username, password, email, role)
        VALUES (${boId}, ${id}, ${boUsername}, ${boPassHash}, ${email || null}, 'owner')
        ON CONFLICT (username) DO NOTHING`

      // Create default market
      const marketId = 'mkt-' + uid()
      await sql`
        INSERT INTO markets (id, brand_id, name, country, currency_code, currency_symbol)
        VALUES (${marketId}, ${id}, 'Default Market', ${country || 'Malaysia'}, 'MYR', 'RM')`

      // Create default outlet
      const outletId = 'out-' + uid()
      await sql`
        INSERT INTO outlets (id, brand_id, market_id, name, phone, email, address, opening_time, closing_time)
        VALUES (${outletId}, ${id}, ${marketId},
          ${outlet_name || name.trim() + ' - Main'},
          ${outlet_phone || null}, ${outlet_email || null}, ${address || null},
          ${opening_time || '09:00'}, ${closing_time || '22:00'})`

      res.json({
        ok: true,
        brand: { id, name: name.trim(), license_key: licenseKey, max_terminals, expires_at: expiresAt,
                 bo_username: boUsername, bo_password: boPassword },
        market: { id: marketId },
        outlet: { id: outletId },
        instructions: `Brand ID: ${id}  |  License Key: ${licenseKey}`,
      })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Superadmin: list all brands ───────────────────────────────────────────
  router.get('/restaurants', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`
        SELECT b.id, b.name, b.license_prefix, b.license_key_enc, b.max_terminals,
          b.expires_at, b.active, b.created_at, b.notes,
          b.email, b.owner_name, b.phone, b.city, b.country,
          b.plan, b.status, b.trial_ends_at, b.onboarding_step, b.signup_source,
          b.reseller, b.bo_username, b.bo_password_enc,
          COUNT(t.id)::int AS terminal_count
        FROM brands b
        LEFT JOIN terminal_registrations t ON t.brand_id = b.id AND t.active = true
        GROUP BY b.id ORDER BY b.created_at DESC`
      res.json({ ok: true, restaurants: rows.map(decryptBrand) })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
      const newEnc  = encryptText(newKey)
      await sql`UPDATE brands SET license_key_hash=${newHash}, license_prefix=${prefix}, license_key_enc=${newEnc} WHERE id=${id}`
      res.json({ ok: true, id, new_license_key: newKey })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
        updates.bo_password_enc = encryptText(bo_password)
        const bcrypt = require('bcryptjs')
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
          VALUES (${catId}, ${bid}, ${outletId}, ${cat.name}, ${cat.color}, ${ci}, true)
          ON CONFLICT DO NOTHING`
        for (let ii = 0; ii < cat.items.length; ii++) {
          const itemId = 'itm-' + uid()
          const price  = parseFloat((Math.random() * 15 + 5).toFixed(2))
          await sql`
            INSERT INTO menu_items (id, brand_id, outlet_id, category_id, name, price, active)
            VALUES (${itemId}, ${bid}, ${outletId}, ${catId}, ${cat.items[ii]}, ${price}, true)
            ON CONFLICT DO NOTHING`
        }
      }

      res.json({ ok: true, message: `Sample data seeded for outlet: ${outlet.name}` })
    } catch (e) { res.status(500).json({ error: e.message }) }
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

      if (existingTerm) {
        await sql`UPDATE terminal_registrations SET last_seen=now(), active=true, outlet_id=${outlet_id || null} WHERE id=${existingTerm.id}`
      } else {
        const [{ cnt }] = await sql`
          SELECT COUNT(*)::int AS cnt FROM terminal_registrations
          WHERE brand_id=${brand_id} AND active=true`
        if (cnt >= brand.max_terminals)
          return res.status(403).json({
            error: `Terminal limit reached (${brand.max_terminals}).`,
            code: 'TERMINAL_LIMIT',
          })
        const terminalId = `${brand_id}-${mid}-${Date.now().toString(36)}`
        await sql`INSERT INTO terminal_registrations (id, brand_id, machine_id, outlet_id, last_seen)
                  VALUES (${terminalId}, ${brand_id}, ${mid}, ${outlet_id || null}, now())`
      }

      res.json({
        ok: true,
        machine_id: mid,
        brand: { id: brand.id, name: brand.name },
        restaurant: { id: brand.id, name: brand.name }, // legacy alias
        outlet: outlet ? { id: outlet.id, name: outlet.name } : null,
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Superadmin: update outlet license date ────────────────────────────────
  router.patch('/outlets/:id', jwtAuth, async (req, res) => {
    const { license_end_date } = req.body || {}
    try {
      await sql`UPDATE outlets SET license_end_date = ${license_end_date || null} WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Superadmin: terminals for a brand ────────────────────────────────────
  router.get('/restaurants/:id/terminals', jwtAuth, async (req, res) => {
    try {
      const rows = await sql`
        SELECT * FROM terminal_registrations
        WHERE brand_id = ${req.params.id}
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

  // ── Global payment methods ────────────────────────────────────────────────
  router.get('/global-payment-methods', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`SELECT * FROM global_payment_methods ORDER BY sort_order, name`
      res.json({ ok: true, rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/global-payment-methods/:id', jwtAuth, async (req, res) => {
    try {
      await sql`DELETE FROM outlet_hidden_payments WHERE method_id = ${req.params.id}`
      await sql`DELETE FROM global_payment_methods WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Global delivery partners ──────────────────────────────────────────────
  router.get('/global-delivery-partners', jwtAuth, async (_req, res) => {
    try {
      const rows = await sql`SELECT * FROM global_delivery_partners ORDER BY sort_order, name`
      res.json({ ok: true, rows })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/global-delivery-partners/:id', jwtAuth, async (req, res) => {
    try {
      await sql`DELETE FROM outlet_hidden_partners WHERE partner_id = ${req.params.id}`
      await sql`DELETE FROM global_delivery_partners WHERE id = ${req.params.id}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
