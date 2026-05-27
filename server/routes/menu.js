'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')
const { serverError } = require('../middleware/serverError')

module.exports = function menuRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  const { randomUUID } = require('crypto')
  function uid () { return randomUUID().replace(/-/g, '').slice(0, 20) }

  // ── CATEGORIES ─────────────────────────────────────────────────────────────

  router.get('/', async (req, res) => {
    const rid = req.user?.brand_id
    if (!rid) return res.json({ categories: [], items: [] })
    const oid = req.query.outlet_id || null
    try {
      const [categories, items, variants] = await Promise.all([
        oid
          ? sql`SELECT * FROM categories WHERE brand_id = ${rid} AND (outlet_id = ${oid} OR outlet_id IS NULL) ORDER BY sort_order, name`
          : sql`SELECT * FROM categories WHERE brand_id = ${rid} ORDER BY sort_order, name`,
        oid
          ? sql`SELECT * FROM menu_items WHERE brand_id = ${rid} AND (outlet_id = ${oid} OR outlet_id IS NULL) ORDER BY name`
          : sql`SELECT * FROM menu_items WHERE brand_id = ${rid} ORDER BY name`,
        sql`
          SELECT iv.* FROM item_variants iv
          WHERE iv.item_id IN (SELECT id FROM menu_items WHERE brand_id = ${rid})
          ORDER BY iv.item_id, iv.sort_order, iv.name`,
      ])
      const varMap = {}
      variants.forEach(v => { (varMap[v.item_id] = varMap[v.item_id] || []).push(v) })
      items.forEach(i => { i.variants = varMap[i.id] || [] })
      res.json({ categories, items })
    } catch (e) { serverError(res, e) }
  })

  router.post('/categories', async (req, res) => {
    const { name, color, sort_order, outlet_id } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const id  = uid()
      const rid = req.user?.brand_id || null
      const row = await sql`
        INSERT INTO categories (id, name, color, sort_order, active, synced_at, brand_id, outlet_id)
        VALUES (${id}, ${name}, ${color || '#f97316'}, ${sort_order || 0}, 1, ${Date.now()}, ${rid}, ${outlet_id || null})
        RETURNING *`
      res.json({ ok: true, category: row[0] })
    } catch (e) { serverError(res, e) }
  })

  router.put('/categories/:id', async (req, res) => {
    const { name, color, sort_order, active } = req.body || {}
    const rid = req.user?.brand_id
    try {
      const row = await sql`
        UPDATE categories SET
          name       = COALESCE(${name ?? null}, name),
          color      = COALESCE(${color ?? null}, color),
          sort_order = COALESCE(${sort_order ?? null}, sort_order),
          active     = COALESCE(${active ?? null}, active),
          synced_at  = ${Date.now()}
        WHERE id = ${req.params.id}
          AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))
        RETURNING *`
      if (!row.length) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, category: row[0] })
    } catch (e) { serverError(res, e) }
  })

  router.delete('/categories/:id', async (req, res) => {
    const rid = req.user?.brand_id
    try {
      await sql`DELETE FROM categories WHERE id = ${req.params.id}
        AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── MENU ITEMS ──────────────────────────────────────────────────────────────

  // GET /menu/items/:id — single item with variants + modifier groups
  router.get('/items/:id', async (req, res) => {
    const rid = req.user?.brand_id
    try {
      const [item] = await sql`
        SELECT * FROM menu_items WHERE id = ${req.params.id}
          AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      if (!item) return res.status(404).json({ error: 'not found' })
      const [variants, modGroups] = await Promise.all([
        sql`SELECT * FROM item_variants WHERE item_id = ${item.id} ORDER BY sort_order, name`,
        sql`
          SELECT mg.*, json_agg(mo.* ORDER BY mo.sort_order, mo.name) FILTER (WHERE mo.id IS NOT NULL) AS options
          FROM modifier_groups mg
          JOIN item_modifier_groups img ON img.group_id = mg.id
          LEFT JOIN modifier_options mo ON mo.group_id = mg.id
          WHERE img.item_id = ${item.id}
          GROUP BY mg.id`,
      ])
      item.variants   = variants
      item.mod_groups = modGroups
      res.json({ item })
    } catch (e) { serverError(res, e) }
  })

  router.post('/items', async (req, res) => {
    const {
      name, price, category_id, description, short_description, long_description, item_code, outlet_id,
      sub_category, image_url, item_type, preparation_time, tax_group_id,
      barcode, kitchen_name, internal_note, printer_group, tags,
      dine_in_price, takeaway_price, delivery_price, online_price,
      dine_in_active, takeaway_active, delivery_active, online_active,
      partner_prices,
    } = req.body || {}
    if (!name || !price || !category_id) return res.status(400).json({ error: 'name, price, category_id required' })
    try {
      const id  = uid()
      const rid = req.user?.brand_id || null
      const ppJson = partner_prices && typeof partner_prices === 'object' ? JSON.stringify(partner_prices) : '{}'
      const row = await sql`
        INSERT INTO menu_items (
          id, category_id, name, price, description, short_description, long_description, item_code, active, synced_at, brand_id, outlet_id,
          sub_category, image_url, item_type, preparation_time, tax_group_id,
          barcode, kitchen_name, internal_note, printer_group, tags,
          dine_in_price, takeaway_price, delivery_price, online_price,
          dine_in_active, takeaway_active, delivery_active, online_active,
          partner_prices
        ) VALUES (
          ${id}, ${category_id}, ${name}, ${price}, ${description || ''}, ${short_description || null}, ${long_description || null}, ${item_code || null}, 1, ${Date.now()}, ${rid}, ${outlet_id || null},
          ${sub_category || null}, ${image_url || null}, ${item_type || 'single'}, ${preparation_time || 0}, ${tax_group_id || null},
          ${barcode || null}, ${kitchen_name || name}, ${internal_note || null}, ${printer_group || null}, ${tags || null},
          ${dine_in_price ?? null}, ${takeaway_price ?? null}, ${delivery_price ?? null}, ${online_price ?? null},
          ${dine_in_active !== false}, ${takeaway_active !== false}, ${delivery_active !== false}, ${online_active !== false},
          ${ppJson}
        ) RETURNING *`
      res.json({ ok: true, item: row[0] })
    } catch (e) { serverError(res, e) }
  })

  router.put('/items/:id', async (req, res) => {
    const {
      name, price, category_id, description, short_description, long_description, active, item_code,
      sub_category, image_url, item_type, preparation_time, tax_group_id,
      barcode, kitchen_name, internal_note, printer_group, tags,
      dine_in_price, takeaway_price, delivery_price, online_price,
      dine_in_active, takeaway_active, delivery_active, online_active,
      partner_prices,
    } = req.body || {}
    const rid = req.user?.brand_id
    const ppJson = partner_prices !== undefined
      ? (typeof partner_prices === 'object' ? JSON.stringify(partner_prices) : partner_prices)
      : undefined
    try {
      const row = await sql`
        UPDATE menu_items SET
          name           = COALESCE(${name ?? null}, name),
          price          = COALESCE(${price ?? null}, price),
          category_id    = COALESCE(${category_id ?? null}, category_id),
          description         = COALESCE(${description ?? null}, description),
          short_description   = CASE WHEN ${short_description !== undefined} THEN ${short_description ?? null} ELSE short_description END,
          long_description    = CASE WHEN ${long_description !== undefined} THEN ${long_description ?? null} ELSE long_description END,
          item_code      = CASE WHEN ${item_code !== undefined} THEN ${item_code ?? null} ELSE item_code END,
          active         = COALESCE(${active ?? null}, active),
          sub_category   = CASE WHEN ${sub_category !== undefined} THEN ${sub_category ?? null} ELSE sub_category END,
          image_url      = CASE WHEN ${image_url !== undefined} THEN ${image_url ?? null} ELSE image_url END,
          item_type      = CASE WHEN ${item_type !== undefined} THEN ${item_type ?? 'single'} ELSE item_type END,
          preparation_time = CASE WHEN ${preparation_time !== undefined} THEN ${preparation_time ?? 0} ELSE preparation_time END,
          tax_group_id   = CASE WHEN ${tax_group_id !== undefined} THEN ${tax_group_id ?? null} ELSE tax_group_id END,
          barcode        = CASE WHEN ${barcode !== undefined} THEN ${barcode ?? null} ELSE barcode END,
          kitchen_name   = CASE WHEN ${kitchen_name !== undefined} THEN COALESCE(${kitchen_name ?? null}, ${name ?? null}) ELSE kitchen_name END,
          internal_note  = CASE WHEN ${internal_note !== undefined} THEN ${internal_note ?? null} ELSE internal_note END,
          printer_group  = CASE WHEN ${printer_group !== undefined} THEN ${printer_group ?? null} ELSE printer_group END,
          tags           = CASE WHEN ${tags !== undefined} THEN ${tags ?? null} ELSE tags END,
          dine_in_price  = CASE WHEN ${dine_in_price !== undefined} THEN ${dine_in_price ?? null} ELSE dine_in_price END,
          takeaway_price = CASE WHEN ${takeaway_price !== undefined} THEN ${takeaway_price ?? null} ELSE takeaway_price END,
          delivery_price = CASE WHEN ${delivery_price !== undefined} THEN ${delivery_price ?? null} ELSE delivery_price END,
          online_price   = CASE WHEN ${online_price !== undefined} THEN ${online_price ?? null} ELSE online_price END,
          dine_in_active  = CASE WHEN ${dine_in_active !== undefined} THEN ${dine_in_active} ELSE dine_in_active END,
          takeaway_active = CASE WHEN ${takeaway_active !== undefined} THEN ${takeaway_active} ELSE takeaway_active END,
          delivery_active = CASE WHEN ${delivery_active !== undefined} THEN ${delivery_active} ELSE delivery_active END,
          online_active   = CASE WHEN ${online_active !== undefined} THEN ${online_active} ELSE online_active END,
          partner_prices  = CASE WHEN ${ppJson !== undefined} THEN ${ppJson ?? '{}'}::jsonb ELSE partner_prices END,
          synced_at      = ${Date.now()}
        WHERE id = ${req.params.id}
          AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))
        RETURNING *`
      if (!row.length) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, item: row[0] })
    } catch (e) { serverError(res, e) }
  })

  router.delete('/items/:id', async (req, res) => {
    const rid = req.user?.brand_id
    try {
      await sql`DELETE FROM menu_items WHERE id = ${req.params.id}
        AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── BULK EXPORT ────────────────────────────────────────────────────────────

  router.get('/export', async (req, res) => {
    const rid = req.user?.brand_id
    if (!rid) return res.json({ rows: [] })
    try {
      const rows = await sql`
        SELECT
          mi.item_code, mi.name, c.name AS category, mi.price,
          mi.description, mi.active, mi.barcode, mi.item_type,
          mi.kitchen_name, mi.tags, mi.sub_category,
          mi.dine_in_price, mi.takeaway_price, mi.delivery_price, mi.online_price,
          mi.dine_in_active, mi.takeaway_active, mi.delivery_active, mi.online_active
        FROM menu_items mi
        LEFT JOIN categories c ON c.id = mi.category_id
        WHERE mi.brand_id = ${rid}
        ORDER BY c.name, mi.name`
      res.json({ rows })
    } catch (e) { serverError(res, e) }
  })

  // ── BULK IMPORT ────────────────────────────────────────────────────────────

  router.post('/import', async (req, res) => {
    const rid = req.user?.brand_id
    if (!rid) return res.status(403).json({ error: 'No brand context' })
    const { rows } = req.body || {}
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows array required' })

    try {
      let created = 0, updated = 0
      const errors = []

      await sql.begin(async sql => {
      const cats    = await sql`SELECT id, name FROM categories WHERE brand_id = ${rid}`
      const catMap  = new Map(cats.map(c => [c.name.toLowerCase().trim(), c.id]))

      const existing  = await sql`SELECT id, item_code, name, category_id FROM menu_items WHERE brand_id = ${rid}`
      const byCode    = new Map(existing.filter(i => i.item_code).map(i => [i.item_code.toLowerCase().trim(), i.id]))
      const byNameCat = new Map(existing.map(i => [`${i.name.toLowerCase().trim()}|${i.category_id}`, i.id]))

      for (const row of rows) {
        const name    = row.name?.toString().trim()
        const catName = row.category?.toString().trim()
        const price   = parseFloat(row.price)

        if (!name)        { errors.push(`Row skipped: missing name`);              continue }
        if (!catName)     { errors.push(`"${name}" skipped: missing category`);    continue }
        if (isNaN(price)) { errors.push(`"${name}" skipped: invalid price`);       continue }

        let catId = catMap.get(catName.toLowerCase())
        if (!catId) {
          const [nc] = await sql`INSERT INTO categories (id, brand_id, name, sort_order) VALUES (${uid()}, ${rid}, ${catName}, 0) RETURNING id`
          catId = nc.id
          catMap.set(catName.toLowerCase(), catId)
        }

        const bool  = v => !/^(no|false|0)$/i.test((v ?? '').toString())
        const numOrNull = v => (v !== undefined && v !== '' && !isNaN(parseFloat(v))) ? parseFloat(v) : null
        const strOrNull = v => (v !== undefined && v !== '') ? v.toString().trim() : null

        const p = {
          name, category_id: catId, price,
          description:     strOrNull(row.description) ?? '',
          active:          /^(yes|true|1|active)$/i.test((row.active ?? 'yes').toString()) ? 1 : 0,
          item_code:       strOrNull(row.item_code),
          barcode:         strOrNull(row.barcode),
          item_type:       strOrNull(row.item_type) ?? 'single',
          kitchen_name:    strOrNull(row.kitchen_name),
          tags:            strOrNull(row.tags),
          sub_category:    strOrNull(row.sub_category),
          dine_in_price:   numOrNull(row.dine_in_price),
          takeaway_price:  numOrNull(row.takeaway_price),
          delivery_price:  numOrNull(row.delivery_price),
          online_price:    numOrNull(row.online_price),
          dine_in_active:  bool(row.dine_in_active),
          takeaway_active: bool(row.takeaway_active),
          delivery_active: bool(row.delivery_active),
          online_active:   bool(row.online_active),
        }

        const codeKey = p.item_code?.toLowerCase()
        const nameKey = `${name.toLowerCase()}|${catId}`
        const existId = (codeKey && byCode.get(codeKey)) || byNameCat.get(nameKey)

        if (existId) {
          await sql`
            UPDATE menu_items SET
              name=${p.name}, category_id=${p.category_id}, price=${p.price},
              description=${p.description}, active=${p.active}, item_code=${p.item_code},
              barcode=${p.barcode}, item_type=${p.item_type}, kitchen_name=${p.kitchen_name},
              tags=${p.tags}, sub_category=${p.sub_category},
              dine_in_price=${p.dine_in_price}, takeaway_price=${p.takeaway_price},
              delivery_price=${p.delivery_price}, online_price=${p.online_price},
              dine_in_active=${p.dine_in_active}, takeaway_active=${p.takeaway_active},
              delivery_active=${p.delivery_active}, online_active=${p.online_active},
              synced_at=${Date.now()}
            WHERE id=${existId} AND brand_id=${rid}`
          updated++
        } else {
          await sql`
            INSERT INTO menu_items (
              id, brand_id, category_id, name, price, description, active, item_code,
              barcode, item_type, kitchen_name, tags, sub_category, synced_at,
              dine_in_price, takeaway_price, delivery_price, online_price,
              dine_in_active, takeaway_active, delivery_active, online_active
            ) VALUES (
              ${uid()}, ${rid}, ${p.category_id}, ${p.name}, ${p.price},
              ${p.description}, ${p.active}, ${p.item_code},
              ${p.barcode}, ${p.item_type}, ${p.kitchen_name}, ${p.tags}, ${p.sub_category}, ${Date.now()},
              ${p.dine_in_price}, ${p.takeaway_price}, ${p.delivery_price}, ${p.online_price},
              ${p.dine_in_active}, ${p.takeaway_active}, ${p.delivery_active}, ${p.online_active}
            )`
          created++
        }
      }

      }) // end sql.begin

      res.json({ ok: true, created, updated, errors })
    } catch (e) { serverError(res, e) }
  })

  // ── VARIANTS ───────────────────────────────────────────────────────────────

  router.get('/items/:id/variants', async (req, res) => {
    const rid = req.user?.brand_id
    try {
      const rows = await sql`
        SELECT iv.* FROM item_variants iv
        WHERE iv.item_id = ${req.params.id}
          AND iv.item_id IN (SELECT id FROM menu_items WHERE brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))
        ORDER BY iv.sort_order, iv.name`
      res.json({ variants: rows })
    } catch (e) { serverError(res, e) }
  })

  router.post('/items/:id/variants', async (req, res) => {
    const { name, size, price, active, sort_order } = req.body || {}
    if (!name || price == null) return res.status(400).json({ error: 'name and price required' })
    const rid = req.user?.brand_id
    try {
      const [item] = await sql`SELECT id FROM menu_items WHERE id = ${req.params.id}
        AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      if (!item) return res.status(404).json({ error: 'item not found' })
      const row = await sql`
        INSERT INTO item_variants (id, item_id, name, size, price, active, sort_order)
        VALUES (${uid()}, ${req.params.id}, ${name}, ${size || ''}, ${price}, ${active !== false}, ${sort_order || 0})
        RETURNING *`
      res.json({ ok: true, variant: row[0] })
    } catch (e) { serverError(res, e) }
  })

  router.put('/items/:itemId/variants/:vid', async (req, res) => {
    const { name, size, price, active, sort_order } = req.body || {}
    const rid = req.user?.brand_id
    try {
      const row = await sql`
        UPDATE item_variants SET
          name       = COALESCE(${name ?? null}, name),
          size       = COALESCE(${size ?? null}, size),
          price      = COALESCE(${price ?? null}, price),
          active     = COALESCE(${active ?? null}, active),
          sort_order = COALESCE(${sort_order ?? null}, sort_order)
        WHERE id = ${req.params.vid}
          AND item_id = ${req.params.itemId}
          AND item_id IN (SELECT id FROM menu_items WHERE brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))
        RETURNING *`
      if (!row.length) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, variant: row[0] })
    } catch (e) { serverError(res, e) }
  })

  router.delete('/items/:itemId/variants/:vid', async (req, res) => {
    const rid = req.user?.brand_id
    try {
      await sql`DELETE FROM item_variants
        WHERE id = ${req.params.vid}
          AND item_id = ${req.params.itemId}
          AND item_id IN (SELECT id FROM menu_items WHERE brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── MODIFIER GROUPS ────────────────────────────────────────────────────────

  router.get('/modifier-groups', async (req, res) => {
    try {
      const rid = req.user?.brand_id || null
      const groups = await sql`
        SELECT mg.*, json_agg(mo.* ORDER BY mo.sort_order, mo.name) FILTER (WHERE mo.id IS NOT NULL) AS options
        FROM modifier_groups mg
        LEFT JOIN modifier_options mo ON mo.group_id = mg.id
        WHERE mg.brand_id = ${rid}
        GROUP BY mg.id
        ORDER BY mg.name`
      res.json({ groups })
    } catch (e) { serverError(res, e) }
  })

  router.post('/modifier-groups', async (req, res) => {
    const { name, min_select, max_select, required } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const rid = req.user?.brand_id || null
      const row = await sql`
        INSERT INTO modifier_groups (id, brand_id, name, min_select, max_select, required, created_at)
        VALUES (${uid()}, ${rid}, ${name}, ${min_select || 0}, ${max_select || 1}, ${required || false}, ${Date.now()})
        RETURNING *`
      res.json({ ok: true, group: { ...row[0], options: [] } })
    } catch (e) { serverError(res, e) }
  })

  router.put('/modifier-groups/:id', async (req, res) => {
    const { name, min_select, max_select, required } = req.body || {}
    const rid = req.user?.brand_id || null
    try {
      const row = await sql`
        UPDATE modifier_groups SET
          name       = COALESCE(${name ?? null}, name),
          min_select = COALESCE(${min_select ?? null}, min_select),
          max_select = COALESCE(${max_select ?? null}, max_select),
          required   = COALESCE(${required ?? null}, required)
        WHERE id = ${req.params.id} AND brand_id = ${rid}
        RETURNING *`
      if (!row.length) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, group: row[0] })
    } catch (e) { serverError(res, e) }
  })

  router.delete('/modifier-groups/:id', async (req, res) => {
    const rid = req.user?.brand_id || null
    try {
      await sql`DELETE FROM modifier_groups WHERE id = ${req.params.id} AND brand_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // Modifier options within a group
  router.post('/modifier-groups/:id/options', async (req, res) => {
    const { name, price, active, sort_order } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    const rid = req.user?.brand_id || null
    try {
      const [grp] = await sql`SELECT id FROM modifier_groups WHERE id = ${req.params.id} AND brand_id = ${rid}`
      if (!grp) return res.status(404).json({ error: 'group not found' })
      const row = await sql`
        INSERT INTO modifier_options (id, group_id, name, price, active, sort_order)
        VALUES (${uid()}, ${req.params.id}, ${name}, ${price || 0}, ${active !== false}, ${sort_order || 0})
        RETURNING *`
      res.json({ ok: true, option: row[0] })
    } catch (e) { serverError(res, e) }
  })

  router.put('/modifier-groups/:gid/options/:oid', async (req, res) => {
    const { name, price, active } = req.body || {}
    const rid = req.user?.brand_id || null
    try {
      const row = await sql`
        UPDATE modifier_options SET
          name   = COALESCE(${name ?? null}, name),
          price  = COALESCE(${price ?? null}, price),
          active = COALESCE(${active ?? null}, active)
        WHERE id = ${req.params.oid}
          AND group_id = ${req.params.gid}
          AND group_id IN (SELECT id FROM modifier_groups WHERE brand_id = ${rid})
        RETURNING *`
      if (!row.length) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, option: row[0] })
    } catch (e) { serverError(res, e) }
  })

  router.delete('/modifier-groups/:gid/options/:oid', async (req, res) => {
    const rid = req.user?.brand_id || null
    try {
      await sql`DELETE FROM modifier_options
        WHERE id = ${req.params.oid}
          AND group_id = ${req.params.gid}
          AND group_id IN (SELECT id FROM modifier_groups WHERE brand_id = ${rid})`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  // ── ITEM ↔ MODIFIER GROUP LINKS ────────────────────────────────────────────

  router.post('/items/:id/modifier-groups', async (req, res) => {
    const { group_id } = req.body || {}
    if (!group_id) return res.status(400).json({ error: 'group_id required' })
    const rid = req.user?.brand_id || null
    try {
      const [item] = await sql`SELECT id FROM menu_items WHERE id = ${req.params.id}
        AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      if (!item) return res.status(404).json({ error: 'item not found' })
      await sql`
        INSERT INTO item_modifier_groups (item_id, group_id)
        VALUES (${req.params.id}, ${group_id})
        ON CONFLICT DO NOTHING`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  router.delete('/items/:itemId/modifier-groups/:gid', async (req, res) => {
    const rid = req.user?.brand_id || null
    try {
      await sql`DELETE FROM item_modifier_groups
        WHERE item_id = ${req.params.itemId}
          AND group_id = ${req.params.gid}
          AND item_id IN (SELECT id FROM menu_items WHERE brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      res.json({ ok: true })
    } catch (e) { serverError(res, e) }
  })

  return router
}
