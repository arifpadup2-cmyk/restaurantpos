'use strict'

const express  = require('express')
const bcrypt   = require('bcryptjs')
const crypto   = require('crypto')
const {
  generateRestaurantId, generateLicenseKey, hashLicenseKey, keyPrefix,
} = require('../lib/license')

const SIGNUP_SECRET = process.env.JWT_SECRET || ''
if (!SIGNUP_SECRET) {
  console.error('  ✗ FATAL: signup.js requires JWT_SECRET for onboarding-token HMAC')
}

// Public signup wizard order:
//   1. Owner details      (owner_name, email, phone, whatsapp_number)
//   2. Brand details      (brand name, logo, business_type, country)
//   3. Market details     (auto-created from country)
//   4. Outlet details     (outlet name, address, opening/closing time)
//
// Server creates: brand + market + outlet + bo_user + initial settings.
// Brand owner receives:
//   - BO username + one-time password (shown once on success screen)
//   - License key (shown once)
//   - Signed onboarding link: /onboarding/{brand_id}?t={token}

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
  UAE: { code: 'AED', symbol: 'د.إ' },
  'United Arab Emirates': { code: 'AED', symbol: 'د.إ' },
  'Saudi Arabia': { code: 'SAR', symbol: '﷼' },
  Qatar: { code: 'QAR', symbol: '﷼' },
  Kuwait: { code: 'KWD', symbol: 'د.ك' },
  Bahrain: { code: 'BHD', symbol: 'BD' },
  Oman: { code: 'OMR', symbol: 'ر.ع.' },
  Egypt: { code: 'EGP', symbol: 'E£' },
}
function currencyForCountry (c) { return COUNTRY_CURRENCY[c] || { code: 'USD', symbol: '$' } }

function genBoPassword () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 14 }, () => chars[crypto.randomInt(chars.length)]).join('')
}

function genBoUsername (name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'brand'
  return base + crypto.randomInt(100, 1000)
}

function uid () { return crypto.randomUUID().replace(/-/g, '').slice(0, 16) }

// HMAC-signed onboarding token: `<base64(brand_id)>.<hmac>`
function signOnboardingToken (brandId) {
  const payload = Buffer.from(brandId).toString('base64url')
  const mac = crypto.createHmac('sha256', SIGNUP_SECRET).update(payload).digest('base64url').slice(0, 32)
  return `${payload}.${mac}`
}
function verifyOnboardingToken (token) {
  if (!token || typeof token !== 'string') return null
  const [payload, mac] = token.split('.')
  if (!payload || !mac) return null
  const expected = crypto.createHmac('sha256', SIGNUP_SECRET).update(payload).digest('base64url').slice(0, 32)
  // Constant-time compare
  try {
    const a = Buffer.from(mac); const b = Buffer.from(expected)
    if (a.length !== b.length) return null
    if (!crypto.timingSafeEqual(a, b)) return null
  } catch { return null }
  try { return Buffer.from(payload, 'base64url').toString('utf8') } catch { return null }
}

// Email-verification token: random 32 bytes, hex.
function genVerificationToken () { return crypto.randomBytes(32).toString('hex') }

// Stub email-send. Replace with real provider (SES/SendGrid/Resend) at deploy.
function sendVerificationEmail (toEmail, brandName, verifyUrl) {
  console.log(`  ✉ Verification email queued for ${toEmail} (${brandName}): ${verifyUrl}`)
}

module.exports = function signupRouter (sql) {
  const router = express.Router()

  // ── Public signup → create brand + market + outlet + owner ───────────────
  router.post('/signup', async (req, res) => {
    const {
      owner_name, email, phone, whatsapp_number,
      brand_name, logo_url, business_type, country,
      outlet_name, outlet_address, outlet_phone, opening_time, closing_time,
      signup_source,
    } = req.body || {}

    // Required: owner identity + brand identity + country
    if (!owner_name || !String(owner_name).trim())
      return res.status(400).json({ ok: false, error: 'Owner name is required' })
    if (!email || !email.includes('@'))
      return res.status(400).json({ ok: false, error: 'Valid email is required' })
    if (!phone || !String(phone).trim())
      return res.status(400).json({ ok: false, error: 'Mobile number is required' })
    if (!brand_name || !String(brand_name).trim())
      return res.status(400).json({ ok: false, error: 'Brand name is required' })
    if (!business_type || !String(business_type).trim())
      return res.status(400).json({ ok: false, error: 'Business type is required' })
    if (!country || !String(country).trim())
      return res.status(400).json({ ok: false, error: 'Country is required' })

    try {
      const normalizedEmail = String(email).toLowerCase().trim()
      const [existing] = await sql`SELECT id FROM brands WHERE LOWER(email) = ${normalizedEmail}`
      if (existing)
        return res.status(409).json({ ok: false, error: 'An account with this email already exists.' })

      const id          = generateRestaurantId()
      const licenseKey  = generateLicenseKey()
      const keyHash     = await hashLicenseKey(licenseKey)
      const prefix      = keyPrefix(licenseKey)
      const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString()

      const boUsername  = genBoUsername(String(brand_name).trim())
      const boPassword  = genBoPassword()
      const boPassHash  = await bcrypt.hash(boPassword, 10)

      const verifyToken      = genVerificationToken()
      const verifyExpires    = new Date(Date.now() + 24 * 3600000).toISOString()
      const onboardingToken  = signOnboardingToken(id)
      const cur              = currencyForCountry(country)

      // All inserts in one transaction so signup is atomic.
      await sql.begin(async t => {
        await t`
          INSERT INTO brands (
            id, name, license_key_hash, license_prefix, max_terminals,
            email, owner_name, phone, whatsapp_number, country, business_type, logo_url,
            plan, status, trial_ends_at,
            onboarding_step, signup_source, active,
            bo_username,
            email_verified, email_verification_token, email_verification_expires,
            onboarding_token
          ) VALUES (
            ${id}, ${String(brand_name).trim()}, ${keyHash}, ${prefix}, ${5},
            ${normalizedEmail}, ${String(owner_name).trim()}, ${String(phone).trim()},
            ${whatsapp_number ? String(whatsapp_number).trim() : null},
            ${country}, ${business_type}, ${logo_url || null},
            ${'trial'}, ${'trial'}, ${trialEndsAt},
            ${0}, ${signup_source || 'website'}, ${true},
            ${boUsername},
            ${false}, ${verifyToken}, ${verifyExpires},
            ${onboardingToken}
          )`

        const boUserId = id.toLowerCase() + '-bo'
        await t`
          INSERT INTO bo_users (id, username, password, email, role, brand_id)
          VALUES (${boUserId}, ${boUsername}, ${boPassHash}, ${normalizedEmail}, 'owner', ${id})
          ON CONFLICT (username) DO UPDATE SET brand_id = EXCLUDED.brand_id, role = 'owner', email = EXCLUDED.email`

        const marketId = 'mkt-' + uid()
        await t`
          INSERT INTO markets (id, brand_id, name, country, currency_code, currency_symbol)
          VALUES (${marketId}, ${id}, ${country + ' Market'}, ${country},
                  ${cur.code}, ${cur.symbol})`

        const outletId = 'out-' + uid()
        const outName  = (outlet_name && String(outlet_name).trim()) || (String(brand_name).trim() + ' - Main')
        await t`
          INSERT INTO outlets (
            id, brand_id, market_id, name, phone, email, address,
            opening_time, closing_time, country, currency, currency_code, currency_symbol
          ) VALUES (
            ${outletId}, ${id}, ${marketId}, ${outName},
            ${outlet_phone || phone || null}, ${normalizedEmail}, ${outlet_address || null},
            ${opening_time || '09:00'}, ${closing_time || '22:00'},
            ${country}, ${cur.code}, ${cur.code}, ${cur.symbol})`

        // Initial brand-wide settings (brand_id, outlet_id='' = brand defaults)
        for (const [key, val] of [
          ['tax_rate',     '0'],
          ['tax_system',   'exclusive'],
          ['branch_name',  outName],
          ['currency',     cur.code],
          ['currency_symbol', cur.symbol],
        ]) {
          await t`
            INSERT INTO settings (brand_id, outlet_id, key, value)
            VALUES (${id}, ${''}, ${key}, ${val})
            ON CONFLICT (brand_id, outlet_id, key) DO UPDATE SET value = EXCLUDED.value`
        }
      })

      // Send verification email (stub)
      const verifyUrl = `${req.protocol}://${req.get('host')}/api/signup/verify?t=${verifyToken}`
      sendVerificationEmail(normalizedEmail, String(brand_name).trim(), verifyUrl)

      res.json({
        ok: true,
        brand: {
          id,
          name:            String(brand_name).trim(),
          owner_name:      String(owner_name).trim(),
          license_key:     licenseKey,           // SHOWN ONCE
          trial_ends_at:   trialEndsAt,
          onboarding_step: 0,
          bo_username:     boUsername,
          bo_password:     boPassword,           // SHOWN ONCE
          email_verified:  false,
        },
        onboarding_url: `/onboarding/${id}?t=${onboardingToken}`,
        verify_required: true,
        note: 'Verification email sent. Login is blocked until email is verified.',
      })
    } catch (e) {
      console.error('Signup error:', e.message)
      res.status(500).json({ ok: false, error: 'Signup failed. Please try again.' })
    }
  })

  // ── Public: verify email (link from welcome email) ───────────────────────
  router.get('/verify', async (req, res) => {
    const token = (req.query.t || '').toString().trim()
    if (!token) return res.status(400).send('Missing token')
    try {
      const [row] = await sql`
        SELECT id, email_verification_expires
        FROM brands
        WHERE email_verification_token = ${token}`
      if (!row) return res.status(404).send('Invalid or expired verification link.')
      if (row.email_verification_expires && new Date(row.email_verification_expires) < new Date())
        return res.status(410).send('Verification link expired. Request a new one from the login page.')

      await sql`
        UPDATE brands SET email_verified = true,
                          email_verification_token = NULL,
                          email_verification_expires = NULL
        WHERE id = ${row.id}`

      res.send('<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>Email verified.</h2><p>You can now sign in to the back office.</p><a href="/backoffice/">Open back office</a></body></html>')
    } catch (e) { res.status(500).send('Verification failed: ' + e.message) }
  })

  // ── Public: resend verification email ────────────────────────────────────
  router.post('/verify/resend', async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim()
    if (!email) return res.status(400).json({ ok: false, error: 'Email required' })
    try {
      const [row] = await sql`SELECT id, name FROM brands WHERE LOWER(email) = ${email} AND email_verified = false`
      if (!row) return res.json({ ok: true })       // do not leak
      const token   = genVerificationToken()
      const expires = new Date(Date.now() + 24 * 3600000).toISOString()
      await sql`UPDATE brands SET email_verification_token=${token}, email_verification_expires=${expires} WHERE id=${row.id}`
      sendVerificationEmail(email, row.name, `${req.protocol}://${req.get('host')}/api/signup/verify?t=${token}`)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  // ── Public: get onboarding data — requires signed token ─────────────────
  router.get('/onboarding/:id', async (req, res) => {
    const token = (req.query.t || '').toString().trim()
    const claimed = verifyOnboardingToken(token)
    if (!claimed || claimed !== req.params.id)
      return res.status(401).json({ ok: false, error: 'Unauthorized onboarding access' })
    try {
      const [row] = await sql`
        SELECT id, name, owner_name, email, city, country, business_type,
               plan, status, trial_ends_at, onboarding_step, created_at, email_verified
        FROM brands WHERE id = ${req.params.id}`
      if (!row) return res.status(404).json({ ok: false, error: 'Brand not found' })
      res.json({ ok: true, brand: row })
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  // ── Public: update onboarding step — requires signed token ──────────────
  router.post('/onboarding/:id/step', async (req, res) => {
    const token = (req.query.t || req.body?.t || '').toString().trim()
    const claimed = verifyOnboardingToken(token)
    if (!claimed || claimed !== req.params.id)
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    const { step } = req.body || {}
    if (step === undefined || step === null)
      return res.status(400).json({ ok: false, error: 'step is required' })
    try {
      const [row] = await sql`SELECT id, onboarding_step FROM brands WHERE id = ${req.params.id}`
      if (!row) return res.status(404).json({ ok: false, error: 'Brand not found' })
      const newStep = Math.max(row.onboarding_step || 0, parseInt(step, 10))
      await sql`UPDATE brands SET onboarding_step=${newStep} WHERE id=${req.params.id}`
      res.json({ ok: true, onboarding_step: newStep })
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  return router
}

module.exports.verifyOnboardingToken = verifyOnboardingToken
module.exports.signOnboardingToken   = signOnboardingToken
