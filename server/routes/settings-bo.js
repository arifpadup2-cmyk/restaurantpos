'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

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
  ]

  // GET /settings — returns all public settings
  router.get('/', async (req, res) => {
    const rid = req.user?.brand_id || ''
    try {
      const rows = await sql`SELECT key, value FROM settings WHERE key = ANY(${KEYS}) AND brand_id = ${rid}`
      const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))
      if (req.user?.brand_id) {
        const [b] = await sql`SELECT setup_done, name FROM brands WHERE id = ${req.user.brand_id}`
        settings.setup_done = b?.setup_done ?? (settings.setup_done === 'true' || settings.setup_done === true)
        if (!settings.restaurant_name && b?.name) settings.restaurant_name = b.name
      } else {
        settings.setup_done = true
      }
      res.json({ settings })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT /settings — upsert restaurant settings
  router.put('/', async (req, res) => {
    const rid  = req.user?.brand_id || ''
    const body = req.body || {}
    try {
      for (const key of KEYS) {
        if (body[key] === undefined) continue
        await sql`
          INSERT INTO settings (brand_id, key, value) VALUES (${rid}, ${key}, ${String(body[key])})
          ON CONFLICT (brand_id, key) DO UPDATE SET value = EXCLUDED.value`
      }
      if (req.user?.brand_id) {
        const rid           = req.user.brand_id
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
        const marketName = (body.market_name || '').trim()
        if (marketName) {
          const [existing] = await sql`SELECT id FROM markets WHERE brand_id = ${rid} ORDER BY created_at LIMIT 1`
          if (existing) {
            await sql`UPDATE markets SET name = ${marketName} WHERE id = ${existing.id}`
          } else {
            const mid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
            await sql`INSERT INTO markets (id, brand_id, name, created_at) VALUES (${mid}, ${rid}, ${marketName}, ${Date.now()})`
          }
        }

        // Upsert outlet whenever branch_name is provided — ensures outlet exists in outlets table
        const branchName = (body.branch_name || '').trim()
        if (branchName) {
          const [mkt] = await sql`SELECT id FROM markets WHERE brand_id = ${rid} ORDER BY created_at LIMIT 1`
          if (mkt) {
            const currency   = (body.currency || 'USD').trim()
            const symMap     = { USD:'$', MYR:'RM', SGD:'S$', GBP:'£', EUR:'€', AUD:'A$', CAD:'C$', AED:'د.إ', SAR:'﷼', INR:'₹', JPY:'¥', CNY:'¥', KRW:'₩', THB:'฿', IDR:'Rp', PHP:'₱', VND:'₫', PKR:'₨', BDT:'৳', LKR:'₨', QAR:'﷼', KWD:'د.ك', BHD:'BD', OMR:'ر.ع.', JOD:'JD', EGP:'E£', NGN:'₦', KES:'KSh', ZAR:'R', NZD:'NZ$', HKD:'HK$', TWD:'NT$' }
            const curSym     = symMap[currency] || currency
            const oPhone     = (body.outlet_phone || '').trim() || null
            const oEmail     = (body.outlet_email || '').trim() || null
            const oAddr      = (body.address || '').trim() || null
            const oOpen      = (body.opening_time || '09:00').trim()
            const oClose     = (body.closing_time || '22:00').trim()
            const oCountry   = (body.country || '').trim() || null
            const [existing] = await sql`SELECT id FROM outlets WHERE brand_id = ${rid} ORDER BY created_at LIMIT 1`
            if (existing) {
              await sql`
                UPDATE outlets SET
                  name          = ${branchName},
                  market_id     = ${mkt.id},
                  phone         = COALESCE(${oPhone}, phone),
                  email         = COALESCE(${oEmail}, email),
                  address       = COALESCE(${oAddr}, address),
                  opening_time  = ${oOpen},
                  closing_time  = ${oClose},
                  currency      = ${currency},
                  currency_code = ${currency},
                  currency_symbol = ${curSym},
                  country       = COALESCE(${oCountry}, country)
                WHERE id = ${existing.id}`
            } else {
              const oid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
              await sql`
                INSERT INTO outlets (id, brand_id, market_id, name, phone, email, address, opening_time, closing_time, currency, country, currency_code, currency_symbol, created_at)
                VALUES (${oid}, ${rid}, ${mkt.id}, ${branchName}, ${oPhone}, ${oEmail}, ${oAddr}, ${oOpen}, ${oClose}, ${currency}, ${oCountry}, ${currency}, ${curSym}, ${Date.now()})`
            }
          }
        }
      }
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
