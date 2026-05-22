#!/usr/bin/env node
'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const { Client } = require('pg')
const fs         = require('fs')
const path       = require('path')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')

// ── connection ────────────────────────────────────────────────────────────────

function createClient () {
  return new Client({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'restaurant_pos',
    user:     process.env.DB_USER     || 'pos_user',
    password: process.env.DB_PASS     || '',
  })
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getMigrationFiles () {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort()
}

function readSql (file) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
}

function versionOf (file) {
  return path.basename(file, '.sql')
}

// ── migrate (up) ──────────────────────────────────────────────────────────────

async function migrate () {
  const client = createClient()
  await client.connect()

  try {
    // Ensure tracking table exists — runs before any migration
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const { rows } = await client.query('SELECT version FROM schema_migrations')
    const applied   = new Set(rows.map(r => r.version))
    const pending   = getMigrationFiles().filter(f => !applied.has(versionOf(f)))

    if (pending.length === 0) {
      console.log('✓ Database is up to date')
      return
    }

    console.log(`Running ${pending.length} pending migration(s)...\n`)

    for (const file of pending) {
      const version = versionOf(file)
      const sql     = readSql(file)
      const t       = Date.now()

      process.stdout.write(`  → ${file} ... `)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        )
        await client.query('COMMIT')
        console.log(`done (${Date.now() - t}ms)`)
      } catch (e) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed:\n  ${e.message}`)
      }
    }

    console.log('\n✓ All migrations applied successfully')
  } finally {
    await client.end()
  }
}

// ── rollback (down) ───────────────────────────────────────────────────────────

async function rollback (targetVersion) {
  const client = createClient()
  await client.connect()

  try {
    const { rows } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY version DESC'
    )
    const toRollback = rows.map(r => r.version).filter(v => v > targetVersion)

    if (toRollback.length === 0) {
      console.log('Nothing to roll back — already at or before target version')
      return
    }

    console.log(`Rolling back ${toRollback.length} migration(s)...\n`)

    for (const version of toRollback) {
      const downFile = `${version}.down.sql`
      const downPath = path.join(MIGRATIONS_DIR, downFile)

      if (!fs.existsSync(downPath)) {
        throw new Error(`Missing ${downFile} — cannot roll back. Aborting.`)
      }

      const sql = fs.readFileSync(downPath, 'utf8')
      const t   = Date.now()

      process.stdout.write(`  ← ${downFile} ... `)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'DELETE FROM schema_migrations WHERE version = $1',
          [version]
        )
        await client.query('COMMIT')
        console.log(`done (${Date.now() - t}ms)`)
      } catch (e) {
        await client.query('ROLLBACK')
        throw new Error(`Rollback of ${version} failed:\n  ${e.message}`)
      }
    }

    console.log(`\n✓ Rolled back to version ${targetVersion}`)
  } finally {
    await client.end()
  }
}

// ── status — list applied vs pending ─────────────────────────────────────────

async function status () {
  const client = createClient()
  await client.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const { rows } = await client.query(
      'SELECT version, applied_at FROM schema_migrations ORDER BY version'
    )
    const applied = new Map(rows.map(r => [r.version, r.applied_at]))
    const files   = getMigrationFiles()

    console.log('\nMigration Status\n' + '─'.repeat(60))
    for (const file of files) {
      const v    = versionOf(file)
      const tick = applied.has(v)
        ? `✓  ${applied.get(v).toISOString().slice(0, 19).replace('T', ' ')}`
        : '✗  pending'
      console.log(`  ${v}   ${tick}`)
    }
    console.log('')
  } finally {
    await client.end()
  }
}

// ── entry point ───────────────────────────────────────────────────────────────

const [,, cmd, arg] = process.argv

const handlers = {
  '--down':   () => {
    if (!arg) { console.error('Usage: node migrate.js --down <target-version>'); process.exit(1) }
    return rollback(arg)
  },
  '--status': () => status(),
  undefined:  () => migrate(),
}

const handler = handlers[cmd] || migrate
handler().catch(e => { console.error('\nERROR:', e.message); process.exit(1) })
