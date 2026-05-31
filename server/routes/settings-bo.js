'use strict'

const express = require('express')
const { randomUUID } = require('crypto')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

function uid () { return randomUUID().replace(/-/g, '').slice(0, 20) }

const SYM_MAP = {
  USD:'$', MYR:'RM', SGD:'S$', GBP:'£', EUR:'€', AUD:'A$', CAD:'C$',
  AED:'د.إ', SAR:'﷼', INR:'₹', JPY:'¥', CNY:'¥', KRW:'₩', THB:'฿',
  IDR:'Rp', PHP:'₱', VND:'₫', PKR:'₨', BDT:'৳', LKR:'₨', QAR:'﷼',
  KWD:'د.ك', BHD:'BD', OMR:'ر.ع.', JOD:'JD', EGP:'E£', NGN:'₦',
  KES:'KSh', ZAR:'R', NZD:'NZ$', HKD:'HK$', TWD:'NT$',
}

module.exports = function settingsRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  const KEYS = [
    'restaurant_name', 'currency', 'tax_rate', 'receipt_footer',
    'branch_name', 'service_charge_rate', 'service_charge_label',
    'mgr_discount_threshold', 'require_void_reason', 'cash_variance_alert_pct',
    'kot_stay_seconds',
    'owner_phone', 'business_type', 'country',
    'address', 'opening_time', 'closing_time',
    'table_count', 'outlet_phone', 'outlet_email',
    'market_name', 'tax_system',
    'bill_design', 'kot_design', 'bill_design_config', 'kot_design_config',
  ]

  // GET /settings?outlet_id= — returns settings, outlet-specific overrides brand-wide
  router.get('/', async (req, res) => {
    const rid = req.user?.brand_id || ''
    const oid = req.query.outlet_id || ''
    try {
      // Fetch brand-wide settings (outlet_id='')
      const brandRows = await sql`
        SELECT key, value FROM settings
        WHERE key = ANY(${KEYS}) AND brand_id = ${rid} AND outlet_id = ''`
      const settings = Object.fromEntries(brandRows.map(r => [r.key, r.value]))

      // If outlet_id supplied, overlay outlet-specific overrides
      if (oid) {
        const outletRows = await sql`
          SELECT key, value FROM settings
          WHERE key = ANY(${KEYS}) AND brand_id = ${rid} AND outlet_id = ${oid}`
        outletRows.forEach(r => { settings[r.key] = r.value })
      }

      if (req.user?.brand_id) {
        const [b] = await sql`SELECT setup_done, name FROM brands WHERE id = ${req.user.brand_id}`
        settings.setup_done = b?.setup_done ?? (settings.setup_done === 'true' || settings.setup_done === true)
        if (!settings.restaurant_name && b?.name) settings.restaurant_name = b.name
      } else {
        settings.setup_done = true
      }
      res.json({ settings })
    } catch (e) { serverError(res, e) }
  })

  // PUT /settings?outlet_id= — upsert settings; outlet_id='' means brand-wide
  router.put('/', async (req, res) => {
    const rid  = req.user?.brand_id || ''
    const oid  = req.query.outlet_id || req.body?.outlet_id || ''
    const body = req.body || {}
    try {
      for (const key of KEYS) {
        if (body[key] === undefined) continue
        await sql`
          INSERT INTO settings (brand_id, outlet_id, key, value)
          VALUES (${rid}, ${oid}, ${key}, ${String(body[key])})
          ON CONFLICT (brand_id, outlet_id, key) DO UPDATE SET value = EXCLUDED.value`
      }

      // Sync brand-level fields to brands table (always from brand-wide save)
      if (req.user?.brand_id && oid === '') {
        const name          = (body.restaurant_name || '').trim() || null
        const owner         = (body.owner_name || '').trim() || null
        const business_type = (body.business_type || '').trim() || null
        const country       = (body.country || '').trim() || null
        const setupDone     = body.setup_done ? true : undefined
        if (name || owner || business_type || country || setupDone !== undefined) {
          await sql`
            UPDATE brands
            SET name          = COALESCE(${name}, name),
                owner_name    = COALESCE(${owner}, owner_name),
                business_type = COALESCE(${business_type}, business_type),
                country       = COALESCE(${country}, country),
                setup_done    = COALESCE(${setupDone ?? null}::boolean, setup_done)
            WHERE id = ${rid}`
        }

        // Sync market name
        const marketName = (body.market_name || '').trim()
        if (marketName) {
          const [existing] = await sql`SELECT id FROM markets WHERE brand_id = ${rid} ORDER BY created_at LIMIT 1`
          if (existing) {
            await sql`UPDATE markets SET name = ${marketName} WHERE id = ${existing.id}`
          } else {
            await sql`INSERT INTO markets (id, brand_id, name, created_at) VALUES (${uid()}, ${rid}, ${marketName}, ${Date.now()})`
          }
        }
      }

      // Sync outlet entity — triggered when branch_name is present (brand-wide or outlet-specific)
      const branchName = (body.branch_name || '').trim()
      if (branchName && req.user?.brand_id) {
        const [mkt] = await sql`SELECT id FROM markets WHERE brand_id = ${rid} ORDER BY created_at LIMIT 1`
        if (mkt) {
          const currency = (body.currency || 'USD').trim()
          const curSym   = SYM_MAP[currency] || currency
          const oPhone   = (body.outlet_phone || '').trim() || null
          const oEmail   = (body.outlet_email || '').trim() || null
          const oAddr    = (body.address || '').trim() || null
          const oOpen    = (body.opening_time || '09:00').trim()
          const oClose   = (body.closing_time || '22:00').trim()
          const oCountry = (body.country || '').trim() || null

          // Target: specific outlet (oid) or first outlet for brand-wide save
          let targetOutlet = null
          if (oid) {
            const [o] = await sql`SELECT id FROM outlets WHERE id = ${oid} AND brand_id = ${rid}`
            targetOutlet = o
          } else {
            const [o] = await sql`SELECT id FROM outlets WHERE brand_id = ${rid} ORDER BY created_at LIMIT 1`
            targetOutlet = o
          }

          if (targetOutlet) {
            await sql`
              UPDATE outlets SET
                name            = ${branchName},
                market_id       = ${mkt.id},
                phone           = COALESCE(${oPhone}, phone),
                email           = COALESCE(${oEmail}, email),
                address         = COALESCE(${oAddr}, address),
                opening_time    = ${oOpen},
                closing_time    = ${oClose},
                currency        = ${currency},
                currency_code   = ${currency},
                currency_symbol = ${curSym},
                country         = COALESCE(${oCountry}, country)
              WHERE id = ${targetOutlet.id}`
          } else {
            await sql`
              INSERT INTO outlets (id, brand_id, market_id, name, phone, email, address, opening_time, closing_time, currency, country, currency_code, currency_symbol, created_at)
              VALUES (${uid()}, ${rid}, ${mkt.id}, ${branchName}, ${oPhone}, ${oEmail}, ${oAddr}, ${oOpen}, ${oClose}, ${currency}, ${oCountry}, ${currency}, ${curSym}, ${Date.now()})`
          }
        }
      }

      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  return router
}
