#!/usr/bin/env node
'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const postgres = require('postgres')
const fs       = require('fs')
const path     = require('path')

const SHARED_DIR  = path.join(__dirname, '..', '..', 'pos', 'migrations')
const CENTRAL_DIR = path.join(__dirname, '..', 'migrations')

function createSql () {
  return postgres({
    host:         process.env.DB_HOST     || '127.0.0.1',
    port:         parseInt(process.env.DB_PORT || '5432', 10),
    database:     process.env.DB_NAME     || 'restaurant_pos_central',
    user:         process.env.DB_USER     || 'pos_central_user',
    password:     process.env.DB_PASS     || '',
    max:          1,
    onnotice:     () => {},
  })
}

function getMigrationFiles () {
  const collect = (dir, exclude = []) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir)
          .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql') && !exclude.some(ex => f.includes(ex)))
          .map(f => ({ f, dir }))
      : []

  // Shared: 001 (schema), 002 (indexes), 003 (update_log) — skip sync_queue (local only)
  const shared  = collect(SHARED_DIR, ['sync_queue'])
  // Central-only: future Phase 6 tables
  const central = collect(CENTRAL_DIR)

  return [...shared, ...central].sort((a, b) => a.f.localeCompare(b.f))
}

async function migrate () {
  const sql = createSql()
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`

    const applied  = new Set((await sql`SELECT version FROM schema_migrations`).map(r => r.version))
    const files    = getMigrationFiles()
    const pending  = files.filter(({ f }) => !applied.has(path.basename(f, '.sql')))

    if (pending.length === 0) { console.log('✓ Central DB up to date'); return }

    console.log(`Running ${pending.length} migration(s) on central DB...\n`)
    for (const { f, dir } of pending) {
      const version = path.basename(f, '.sql')
      const migSql  = fs.readFileSync(path.join(dir, f), 'utf8')
      const t       = Date.now()
      process.stdout.write(`  → ${f} ... `)
      await sql.begin(async t => {
        await t.unsafe(migSql)
        await t`INSERT INTO schema_migrations (version) VALUES (${version})`
      })
      console.log(`done (${Date.now() - t}ms)`)
    }
    console.log('\n✓ All central migrations applied')
  } finally {
    await sql.end()
  }
}

async function status () {
  const sql = createSql()
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`
    const applied = new Map((await sql`SELECT version, applied_at FROM schema_migrations ORDER BY version`).map(r => [r.version, r.applied_at]))
    console.log('\nCentral DB Migration Status\n' + '─'.repeat(60))
    for (const { f } of getMigrationFiles()) {
      const v    = path.basename(f, '.sql')
      const tick = applied.has(v) ? `✓  ${applied.get(v).toISOString().slice(0,19).replace('T',' ')}` : '✗  pending'
      console.log(`  ${v}   ${tick}`)
    }
    console.log('')
  } finally {
    await sql.end()
  }
}

const [,, cmd] = process.argv
if (cmd === '--status') status().catch(e => { console.error(e.message); process.exit(1) })
else migrate().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
