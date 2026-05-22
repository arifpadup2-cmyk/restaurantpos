#!/usr/bin/env node
'use strict'

// Reads .env and prints exact psql commands to run as the postgres superuser.
// Run this once on a new machine before running: node scripts/migrate.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const { Client } = require('pg')

const host   = process.env.DB_HOST || '127.0.0.1'
const port   = process.env.DB_PORT || '5432'
const dbName = process.env.DB_NAME || 'restaurant_pos'
const dbUser = process.env.DB_USER || 'pos_user'
const dbPass = process.env.DB_PASS || 'CHANGE_ME'

if (dbPass === 'CHANGE_ME' || dbPass === 'change_this_password') {
  console.error('\nERROR: Set a real DB_PASS in your .env file before running setup.\n')
  process.exit(1)
}

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         Restaurant POS — PostgreSQL First-Time Setup         ║
╚══════════════════════════════════════════════════════════════╝

STEP 1 — Open PowerShell as Administrator and connect to PostgreSQL:

  psql -U postgres -h ${host} -p ${port}

STEP 2 — Paste the following SQL commands exactly:

  CREATE USER ${dbUser} WITH PASSWORD '${dbPass}';
  CREATE DATABASE ${dbName} OWNER ${dbUser};
  GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};
  \\c ${dbName}
  GRANT ALL ON SCHEMA public TO ${dbUser};
  \\q

STEP 3 — Run migrations:

  node scripts/migrate.js

`)

// Optional: verify connection after user signals ready
const args = process.argv.slice(2)
if (args.includes('--verify')) {
  console.log('Verifying connection...\n')
  const client = new Client({ host, port: parseInt(port, 10), database: dbName, user: dbUser, password: dbPass })
  client.connect()
    .then(() => client.query('SELECT current_database(), current_user, version()'))
    .then(({ rows: [r] }) => {
      console.log(`  ✓ Connected to database : ${r.current_database}`)
      console.log(`  ✓ Connected as user     : ${r.current_user}`)
      console.log(`  ✓ PostgreSQL version    : ${r.version.split(' ').slice(0, 2).join(' ')}`)
      console.log('\nSetup verified. Run: node scripts/migrate.js\n')
    })
    .catch(e => {
      console.error(`  ✗ Connection failed: ${e.message}`)
      console.error('\nEnsure PostgreSQL is running and STEP 2 SQL was executed.\n')
      process.exit(1)
    })
    .finally(() => client.end())
}
