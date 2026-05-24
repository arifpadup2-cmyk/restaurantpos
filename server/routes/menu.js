'use strict'

const express = require('express')
const { jwtAuth } = require('../middleware/jwtAuth')

module.exports = function menuRouter (sql) {
  const router = express.Router()
  router.use(jwtAuth)

  function uid () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/categories', async (req, res) => {
    const { name, color, sort_order } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const id  = uid()
      const rid = req.user?.brand_id || null
      const row = await sql`
        INSERT INTO categories (id, name, color, sort_order, active, synced_at, brand_id)
        VALUES (${id}, ${name}, ${color || '#f97316'}, ${sort_order || 0}, 1, ${Date.now()}, ${rid})
        RETURNING *`
      res.json({ ok: true, category: row[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/categories/:id', async (req, res) => {
    const rid = req.user?.brand_id
    try {
      await sql`DELETE FROM categories WHERE id = ${req.params.id}
        AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/items', async (req, res) => {
    const {
      name, price, category_id, description, item_code,
      sub_category, image_url, item_type, preparation_time, tax_group_id,
      barcode, kitchen_name, internal_note, printer_group, tags,
      dine_in_price, takeaway_price, delivery_price, online_price,
      dine_in_active, takeaway_active, delivery_active, online_active,
    } = req.body || {}
    if (!name || !price || !category_id) return res.status(400).json({ error: 'name, price, category_id required' })
    try {
      const id  = uid()
      const rid = req.user?.brand_id || null
      const row = await sql`
        INSERT INTO menu_items (
          id, category_id, name, price, description, item_code, active, synced_at, brand_id,
          sub_category, image_url, item_type, preparation_time, tax_group_id,
          barcode, kitchen_name, internal_note, printer_group, tags,
          dine_in_price, takeaway_price, delivery_price, online_price,
          dine_in_active, takeaway_active, delivery_active, online_active
        ) VALUES (
          ${id}, ${category_id}, ${name}, ${price}, ${description || ''}, ${item_code || null}, 1, ${Date.now()}, ${rid},
          ${sub_category || null}, ${image_url || null}, ${item_type || 'single'}, ${preparation_time || 0}, ${tax_group_id || null},
          ${barcode || null}, ${kitchen_name || null}, ${internal_note || null}, ${printer_group || null}, ${tags || null},
          ${dine_in_price ?? null}, ${takeaway_price ?? null}, ${delivery_price ?? null}, ${online_price ?? null},
          ${dine_in_active !== false}, ${takeaway_active !== false}, ${delivery_active !== false}, ${online_active !== false}
        ) RETURNING *`
      res.json({ ok: true, item: row[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.put('/items/:id', async (req, res) => {
    const {
      name, price, category_id, description, active, item_code,
      sub_category, image_url, item_type, preparation_time, tax_group_id,
      barcode, kitchen_name, internal_note, printer_group, tags,
      dine_in_price, takeaway_price, delivery_price, online_price,
      dine_in_active, takeaway_active, delivery_active, online_active,
    } = req.body || {}
    const rid = req.user?.brand_id
    try {
      const row = await sql`
        UPDATE menu_items SET
          name           = COALESCE(${name ?? null}, name),
          price          = COALESCE(${price ?? null}, price),
          category_id    = COALESCE(${category_id ?? null}, category_id),
          description    = COALESCE(${description ?? null}, description),
          item_code      = CASE WHEN ${item_code !== undefined} THEN ${item_code ?? null} ELSE item_code END,
          active         = COALESCE(${active ?? null}, active),
          sub_category   = CASE WHEN ${sub_category !== undefined} THEN ${sub_category ?? null} ELSE sub_category END,
          image_url      = CASE WHEN ${image_url !== undefined} THEN ${image_url ?? null} ELSE image_url END,
          item_type      = CASE WHEN ${item_type !== undefined} THEN ${item_type ?? 'single'} ELSE item_type END,
          preparation_time = CASE WHEN ${preparation_time !== undefined} THEN ${preparation_time ?? 0} ELSE preparation_time END,
          tax_group_id   = CASE WHEN ${tax_group_id !== undefined} THEN ${tax_group_id ?? null} ELSE tax_group_id END,
          barcode        = CASE WHEN ${barcode !== undefined} THEN ${barcode ?? null} ELSE barcode END,
          kitchen_name   = CASE WHEN ${kitchen_name !== undefined} THEN ${kitchen_name ?? null} ELSE kitchen_name END,
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
          synced_at      = ${Date.now()}
        WHERE id = ${req.params.id}
          AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))
        RETURNING *`
      if (!row.length) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true, item: row[0] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/items/:id', async (req, res) => {
    const rid = req.user?.brand_id
    try {
      await sql`DELETE FROM menu_items WHERE id = ${req.params.id}
        AND (brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/items/:itemId/variants/:vid', async (req, res) => {
    const rid = req.user?.brand_id
    try {
      await sql`DELETE FROM item_variants
        WHERE id = ${req.params.vid}
          AND item_id = ${req.params.itemId}
          AND item_id IN (SELECT id FROM menu_items WHERE brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/modifier-groups/:id', async (req, res) => {
    const rid = req.user?.brand_id || null
    try {
      await sql`DELETE FROM modifier_groups WHERE id = ${req.params.id} AND brand_id = ${rid}`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/modifier-groups/:gid/options/:oid', async (req, res) => {
    const rid = req.user?.brand_id || null
    try {
      await sql`DELETE FROM modifier_options
        WHERE id = ${req.params.oid}
          AND group_id = ${req.params.gid}
          AND group_id IN (SELECT id FROM modifier_groups WHERE brand_id = ${rid})`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
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
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/items/:itemId/modifier-groups/:gid', async (req, res) => {
    const rid = req.user?.brand_id || null
    try {
      await sql`DELETE FROM item_modifier_groups
        WHERE item_id = ${req.params.itemId}
          AND group_id = ${req.params.gid}
          AND item_id IN (SELECT id FROM menu_items WHERE brand_id = ${rid} OR (${rid} IS NULL AND brand_id IS NULL))`
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  return router
}
