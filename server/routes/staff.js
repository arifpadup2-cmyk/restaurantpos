'use strict'

const express = require('express')
const bcrypt  = require('bcryptjs')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

module.exports = function staffRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)
  router.use((req, res, next) => {
    if (req.user?.type === 'cashier')
      return res.status(403).json({ error: 'Access denied' })
    next()
  })

  const { randomUUID } = require('crypto')
  function uid () { return randomUUID().replace(/-/g, '').slice(0, 20) }

  // Strip sensitive fields from cashier rows before sending to client
  function safeCashier (row) {
    const { pin, pin_hash, ...safe } = row
    safe.has_pin = !!(pin || pin_hash)
    return safe
  }

  // Helper: check PIN uniqueness within a brand (excluding a specific cashier id)
  async function isPinTaken (rid, pin, excludeId = null) {
    const rows = rid
      ? excludeId
        ? await sql`SELECT 1 FROM cashiers WHERE brand_id = ${rid} AND pin = ${pin} AND id != ${excludeId} LIMIT 1`
        : await sql`SELECT 1 FROM cashiers WHERE brand_id = ${rid} AND pin = ${pin} LIMIT 1`
      : excludeId
        ? await sql`SELECT 1 FROM cashiers WHERE brand_id IS NULL AND pin = ${pin} AND id != ${excludeId} LIMIT 1`
        : await sql`SELECT 1 FROM cashiers WHERE brand_id IS NULL AND pin = ${pin} LIMIT 1`
    return rows.length > 0
  }

  // Helper: generate a unique 4-digit PIN for a brand
  async function suggestPin (rid) {
    const existing = rid
      ? await sql`SELECT pin FROM cashiers WHERE brand_id = ${rid}`
      : await sql`SELECT pin FROM cashiers WHERE brand_id IS NULL`
    const used = new Set(existing.map(r => r.pin))
    let attempts = 0
    while (attempts < 500) {
      const candidate = String(Math.floor(1000 + Math.random() * 9000))
      if (!used.has(candidate)) return candidate
      attempts++
    }
    return null
  }

  // GET /staff/suggest-pin — returns a unique 4-digit PIN for the brand
  router.get('/suggest-pin', async (req, res) => {
    const rid = req.user?.brand_id || null
    try {
      const pin = await suggestPin(rid)
      if (!pin) return res.status(409).json({ error: 'No available PINs (all 9000 used)' })
      res.json({ pin })
    } catch (e) { serverError(res, e) }
  })

  // GET /staff/check-pin — check if a PIN is available
  router.get('/check-pin', async (req, res) => {
    const { pin, exclude_id } = req.query
    if (!pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be 4 digits' })
    const rid = req.user?.brand_id || null
    try {
      const taken = await isPinTaken(rid, pin, exclude_id || null)
      res.json({ available: !taken })
    } catch (e) { serverError(res, e) }
  })

  // GET /staff/cashiers
  router.get('/cashiers', async (req, res) => {
    const rid = req.user?.brand_id || null
    const oid = req.query.outlet_id || null
    try {
      const cashiers = rid
        ? oid
          ? await sql`SELECT * FROM cashiers WHERE brand_id = ${rid} AND (outlet_id = ${oid} OR outlet_id IS NULL) ORDER BY name`
          : await sql`SELECT * FROM cashiers WHERE brand_id = ${rid} ORDER BY name`
        : await sql`SELECT * FROM cashiers WHERE brand_id IS NULL ORDER BY name`
      res.json({ cashiers: cashiers.map(safeCashier) })
    } catch (e) { serverError(res, e) }
  })

  // POST /staff/cashiers
  router.post('/cashiers', async (req, res) => {
    const { name, pin, role, outlet_id } = req.body || {}
    if (!name || !pin) return res.status(400).json({ error: 'name and pin required' })
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be 4 digits' })
    try {
      const rid  = req.user?.brand_id || null
      if (await isPinTaken(rid, pin))
        return res.status(409).json({ error: 'PIN already used by another staff member in this brand' })
      const id      = uid()
      const pinHash = await bcrypt.hash(pin, 10)
      const [row]   = await sql`
        INSERT INTO cashiers (id, name, pin, pin_hash, role, active, created_at, brand_id, outlet_id)
        VALUES (${id}, ${name}, ${pin}, ${pinHash}, ${role || 'cashier'}, 1, ${Date.now()}, ${rid}, ${outlet_id || null})
        RETURNING *`
      res.json({ ok: true, cashier: safeCashier(row) })
    } catch (e) { serverError(res, e) }
  })

  // PUT /staff/cashiers/:id
  router.put('/cashiers/:id', async (req, res) => {
    const { name, pin, role, active } = req.body || {}
    if (pin && !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be 4 digits' })
    const rid = req.user?.brand_id || null
    try {
      if (pin && await isPinTaken(rid, pin, req.params.id))
        return res.status(409).json({ error: 'PIN already used by another staff member in this brand' })
      const pinHash = pin ? await bcrypt.hash(pin, 10) : null
      const [row]   = await sql`
        UPDATE cashiers SET
          name     = COALESCE(${name ?? null}, name),
          pin      = COALESCE(${pin ?? null}, pin),
          pin_hash = COALESCE(${pinHash}, pin_hash),
          role     = COALESCE(${role ?? null}, role),
          active   = COALESCE(${active ?? null}, active)
        WHERE id = ${req.params.id} AND brand_id = ${rid}
        RETURNING *`
      if (!row) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, cashier: safeCashier(row) })
    } catch (e) { serverError(res, e) }
  })

  return router
}
