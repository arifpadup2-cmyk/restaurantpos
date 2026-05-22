'use strict'

const express = require('express')
const bcrypt  = require('bcryptjs')
const {
  generateRestaurantId, generateLicenseKey, hashLicenseKey, keyPrefix, encryptText,
} = require('../lib/license')

function genBoPassword () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function genBoUsername (name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'rest'
  return base + Math.floor(100 + Math.random() * 900)
}

module.exports = function signupRouter (sql) {
  const router = express.Router()

  // ── Public signup → create 7-day trial ────────────────────────────────────
  router.post('/signup', async (req, res) => {
    const { name, owner_name, email, phone, city, country, signup_source } = req.body || {}
    if (!name || !name.trim())            return res.status(400).json({ ok: false, error: 'Restaurant name is required' })
    if (!owner_name || !owner_name.trim()) return res.status(400).json({ ok: false, error: 'Owner name is required' })
    if (!email || !email.includes('@'))   return res.status(400).json({ ok: false, error: 'Valid email is required' })
    if (!phone || !phone.trim())          return res.status(400).json({ ok: false, error: 'Phone number is required' })

    try {
      const [existing] = await sql`SELECT id FROM restaurants WHERE email = ${email.toLowerCase().trim()}`
      if (existing)
        return res.status(409).json({ ok: false, error: 'An account with this email already exists.' })

      const id          = generateRestaurantId()
      const licenseKey  = generateLicenseKey()
      const keyHash     = await hashLicenseKey(licenseKey)
      const prefix      = keyPrefix(licenseKey)
      const keyEnc      = encryptText(licenseKey)
      const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString()

      // Auto-generate Back Office credentials
      const boUsername  = genBoUsername(name.trim())
      const boPassword  = genBoPassword()
      const boPassHash  = await bcrypt.hash(boPassword, 10)
      const boPassEnc   = encryptText(boPassword)

      await sql`
        INSERT INTO restaurants (
          id, name, license_key_hash, license_prefix, license_key_enc, max_terminals,
          email, owner_name, phone, city, country,
          plan, status, trial_ends_at, license_given_days, license_start_at,
          onboarding_step, signup_source, active,
          bo_username, bo_password_enc
        ) VALUES (
          ${id}, ${name.trim()}, ${keyHash}, ${prefix}, ${keyEnc}, ${5},
          ${email.toLowerCase().trim()}, ${owner_name.trim()}, ${phone.trim()},
          ${(city || '').trim() || null}, ${country || 'Malaysia'},
          ${'trial'}, ${'trial'}, ${trialEndsAt}, ${7}, ${new Date().toISOString()},
          ${0}, ${signup_source || 'website'}, ${true},
          ${boUsername}, ${boPassEnc}
        )`

      // Create bo_users entry so owner can login to Back Office
      const boUserId = id.toLowerCase() + '-bo'
      await sql`
        INSERT INTO bo_users (id, username, password, role)
        VALUES (${boUserId}, ${boUsername}, ${boPassHash}, 'admin')
        ON CONFLICT (username) DO NOTHING`

      res.json({
        ok: true,
        restaurant: {
          id,
          name:            name.trim(),
          owner_name:      owner_name.trim(),
          license_key:     licenseKey,
          trial_ends_at:   trialEndsAt,
          onboarding_step: 0,
          bo_username:     boUsername,
          bo_password:     boPassword,
        },
      })
    } catch (e) {
      console.error('Signup error:', e.message)
      res.status(500).json({ ok: false, error: 'Signup failed. Please try again.' })
    }
  })

  // ── Public: get onboarding data ────────────────────────────────────────────
  router.get('/onboarding/:id', async (req, res) => {
    try {
      const [row] = await sql`
        SELECT id, name, owner_name, email, city, country,
               plan, status, trial_ends_at, onboarding_step, created_at
        FROM restaurants WHERE id = ${req.params.id}`
      if (!row) return res.status(404).json({ ok: false, error: 'Restaurant not found' })
      res.json({ ok: true, restaurant: row })
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  // ── Public: update onboarding step ────────────────────────────────────────
  router.post('/onboarding/:id/step', async (req, res) => {
    const { step } = req.body || {}
    if (step === undefined || step === null)
      return res.status(400).json({ ok: false, error: 'step is required' })
    try {
      const [row] = await sql`SELECT id, onboarding_step FROM restaurants WHERE id = ${req.params.id}`
      if (!row) return res.status(404).json({ ok: false, error: 'Restaurant not found' })
      const newStep = Math.max(row.onboarding_step || 0, parseInt(step, 10))
      await sql`UPDATE restaurants SET onboarding_step=${newStep} WHERE id=${req.params.id}`
      res.json({ ok: true, onboarding_step: newStep })
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  return router
}
