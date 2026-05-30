'use strict'

// Cloud sync daemon — runs only on LOCAL servers (IS_CLOUD_SERVER not set).
// Pushes transaction data up and pulls master data down every 30s / 60s.

let _sql = null
let _cfg = null
let _pushTimer = null
let _pullTimer = null
let _status = { initialized: false, push: {}, pull: {}, lastError: null }

async function initCloudSync (sql, cfg) {
  _sql = sql
  _cfg = cfg

  if (cfg.isCloud) {
    // Cloud server receives pushes — no outbound daemon needed
    return
  }

  if (!cfg.cloudUrl || !cfg.apiKey || !cfg.brandId) {
    console.log('  ℹ  Cloud sync: CLOUD_SYNC_URL / CLOUD_SYNC_KEY / CLOUD_BRAND_ID not configured — local-only mode')
    return
  }

  console.log(`  ✓ Cloud sync daemon started → ${cfg.cloudUrl} (brand: ${cfg.brandId})`)
  _status.initialized = true

  // Initial sync on startup
  await pushToCloud().catch(e => console.error('  ✗ Cloud sync initial push:', e.message))
  await pullFromCloud().catch(e => console.error('  ✗ Cloud sync initial pull:', e.message))

  _pushTimer = setInterval(() => pushToCloud().catch(e => (_status.lastError = e.message)), 30_000)
  _pullTimer = setInterval(() => pullFromCloud().catch(e => (_status.lastError = e.message)), 60_000)
  _pushTimer.unref?.()
  _pullTimer.unref?.()
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getState (entity) {
  try {
    const [r] = await _sql`
      SELECT last_push_at, last_pull_at, push_count
      FROM   cloud_sync_state WHERE entity = ${entity}`
    return r || { last_push_at: 0, last_pull_at: 0, push_count: 0 }
  } catch { return { last_push_at: 0, last_pull_at: 0, push_count: 0 } }
}

async function markPush (entity, count) {
  const now = Date.now()
  try {
    await _sql`
      INSERT INTO cloud_sync_state (entity, last_push_at, push_count, updated_at)
      VALUES (${entity}, ${now}, ${count}, now())
      ON CONFLICT (entity) DO UPDATE SET
        last_push_at = EXCLUDED.last_push_at,
        push_count   = cloud_sync_state.push_count + ${count},
        last_error   = NULL,
        updated_at   = now()`
  } catch {}
}

async function markPull (entity) {
  const now = Date.now()
  try {
    await _sql`
      INSERT INTO cloud_sync_state (entity, last_pull_at, updated_at)
      VALUES (${entity}, ${now}, now())
      ON CONFLICT (entity) DO UPDATE SET
        last_pull_at = EXCLUDED.last_pull_at,
        last_error   = NULL,
        updated_at   = now()`
  } catch {}
}

async function markError (entity, msg) {
  try {
    await _sql`
      INSERT INTO cloud_sync_state (entity, last_error, updated_at)
      VALUES (${entity}, ${msg}, now())
      ON CONFLICT (entity) DO UPDATE SET
        last_error = EXCLUDED.last_error, updated_at = now()`
  } catch {}
}

async function cloudPost (path, body) {
  const r = await fetch(_cfg.cloudUrl + path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': _cfg.apiKey },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function cloudGet (path) {
  const r = await fetch(_cfg.cloudUrl + path, {
    headers: { 'x-api-key': _cfg.apiKey },
    signal:  AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// ── Push (local → cloud) ──────────────────────────────────────────────────────

async function pushToCloud () {
  if (!_sql || !_cfg?.cloudUrl) return
  const bid = _cfg.brandId
  const now = Date.now()

  // Orders (with items)
  try {
    const { last_push_at } = await getState('orders')
    const rows = await _sql`
      SELECT o.*, COALESCE(json_agg(i.*) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
      FROM   orders o
      LEFT   JOIN order_items i ON i.order_id = o.id
      WHERE  o.brand_id = ${bid}
        AND  o.updated_at > ${last_push_at}
      GROUP  BY o.id
      ORDER  BY o.updated_at
      LIMIT  500`

    if (rows.length > 0) {
      await cloudPost('/sync/server-push', { brand_id: bid, entity: 'orders', records: rows })
      await markPush('orders', rows.length)
    }
    _status.push.orders = { at: now, count: rows.length }
  } catch (e) {
    await markError('orders', e.message)
    _status.lastError = `orders push: ${e.message}`
  }

  // Expenses (no updated_at — use created_at)
  try {
    const { last_push_at } = await getState('expenses')
    const rows = await _sql`
      SELECT * FROM expenses
      WHERE  created_at > ${last_push_at}
      ORDER  BY created_at LIMIT 200`

    if (rows.length > 0) {
      await cloudPost('/sync/server-push', { brand_id: bid, entity: 'expenses', records: rows })
      await markPush('expenses', rows.length)
    }
    _status.push.expenses = { at: now, count: rows.length }
  } catch (e) {
    await markError('expenses', e.message)
  }

  // Shifts
  try {
    const { last_push_at } = await getState('shifts')
    const rows = await _sql`
      SELECT * FROM shifts
      WHERE  opened_at > ${last_push_at}
         OR  (closed_at IS NOT NULL AND closed_at > ${last_push_at})
      ORDER  BY opened_at LIMIT 200`

    if (rows.length > 0) {
      await cloudPost('/sync/server-push', { brand_id: bid, entity: 'shifts', records: rows })
      await markPush('shifts', rows.length)
    }
    _status.push.shifts = { at: now, count: rows.length }
  } catch (e) {
    await markError('shifts', e.message)
  }
}

// ── Pull (cloud → local) ──────────────────────────────────────────────────────

async function pullFromCloud () {
  if (!_sql || !_cfg?.cloudUrl) return
  const bid = _cfg.brandId
  const now = Date.now()

  // Categories + menu items
  try {
    const { last_pull_at } = await getState('menu')
    const data = await cloudGet(`/sync/server-pull?brand_id=${bid}&entity=menu&after=${last_pull_at}`)

    const cats  = data.categories || []
    const items = data.items      || []

    if (cats.length > 0 || items.length > 0) {
      await _sql.begin(async t => {
        for (const c of cats) {
          await t`
            INSERT INTO categories (id, brand_id, outlet_id, name, sort_order, color, active, synced_at)
            VALUES (${c.id}, ${bid}, NULL, ${c.name}, ${c.sort_order ?? 0}, ${c.color ?? '#6b7280'}, ${c.active ?? 1}, ${now})
            ON CONFLICT (id) DO UPDATE SET
              brand_id = EXCLUDED.brand_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
              color = EXCLUDED.color, active = EXCLUDED.active, synced_at = EXCLUDED.synced_at`
        }
        for (const it of items) {
          await t`
            INSERT INTO menu_items (id, category_id, name, price, description, active, synced_at)
            VALUES (${it.id}, ${it.category_id}, ${it.name}, ${it.price}, ${it.description ?? null}, ${it.active ?? 1}, ${now})
            ON CONFLICT (id) DO UPDATE SET
              category_id = EXCLUDED.category_id, name = EXCLUDED.name,
              price = EXCLUDED.price, description = EXCLUDED.description,
              active = EXCLUDED.active, synced_at = EXCLUDED.synced_at`
        }
      })
      await markPull('menu')
    }
    _status.pull.menu = { at: now, count: cats.length + items.length }
  } catch (e) {
    await markError('menu_pull', e.message)
    _status.lastError = `menu pull: ${e.message}`
  }

  // Cashiers (staff)
  try {
    const { last_pull_at } = await getState('cashiers')
    const data = await cloudGet(`/sync/server-pull?brand_id=${bid}&entity=cashiers&after=${last_pull_at}`)
    const staff = data.cashiers || []

    if (staff.length > 0) {
      for (const c of staff) {
        await _sql`
          INSERT INTO cashiers (id, brand_id, outlet_id, name, pin, pin_hash, role, active, synced, created_at)
          VALUES (${c.id}, ${c.brand_id ?? bid}, NULL, ${c.name}, ${c.pin ?? null},
                  ${c.pin_hash ?? null}, ${c.role ?? 'cashier'}, ${c.active ?? 1}, 1, ${c.created_at ?? now})
          ON CONFLICT (id) DO UPDATE SET
            brand_id = EXCLUDED.brand_id, name = EXCLUDED.name, pin = EXCLUDED.pin,
            pin_hash = EXCLUDED.pin_hash, role = EXCLUDED.role, active = EXCLUDED.active`
      }
      await markPull('cashiers')
    }
    _status.pull.cashiers = { at: now, count: staff.length }
  } catch (e) {
    await markError('cashiers_pull', e.message)
  }

  // Announcements / ads (global) — mirror the cloud's active set so the POS always
  // shows the latest ads created in the Back Office.
  try {
    const data = await cloudGet('/announcements')
    const ads = data.announcements || []
    await _sql.begin(async t => {
      await t`DELETE FROM announcements`
      for (const a of ads) {
        await t`
          INSERT INTO announcements (id, title, description, badge_text, accent_color, image_url, sort_order, is_active)
          VALUES (${a.id}, ${a.title || ''}, ${a.description || ''}, ${a.badge_text || 'New'},
                  ${a.accent_color || '#f97316'}, ${a.image_url || null}, ${a.sort_order || 0}, true)`
      }
    })
    _status.pull.announcements = { at: now, count: ads.length }
  } catch (e) {
    await markError('announcements_pull', e.message)
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

function getSyncStatus () {
  return {
    initialized: _status.initialized,
    cloudUrl:    _cfg?.cloudUrl  || null,
    brandId:     _cfg?.brandId   || null,
    push:        _status.push,
    pull:        _status.pull,
    lastError:   _status.lastError,
  }
}

function stopCloudSync () {
  clearInterval(_pushTimer)
  clearInterval(_pullTimer)
}

module.exports = { initCloudSync, getSyncStatus, stopCloudSync, pushToCloud, pullFromCloud }
