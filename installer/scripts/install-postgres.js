const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')

const PG_VERSION = '18'
const PG_INSTALLER_URL = 'https://get.enterprisedb.com/postgresql/postgresql-18.0-1-windows-x64.exe'
const PG_INSTALL_DIR = `C:\\Program Files\\PostgreSQL\\${PG_VERSION}`
const PSQL_PATH = path.join(PG_INSTALL_DIR, 'bin', 'psql.exe')

const downloadFile = (url, destPath) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https.get(url, (response) => {
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      fs.unlink(destPath, () => {})
      reject(err)
    })
  })
}

const installPostgreSQL = async (onLog) => {
  try {
    if (fs.existsSync(PSQL_PATH)) {
      onLog('✓ PostgreSQL is already installed')
      return PSQL_PATH
    }

    onLog('Downloading PostgreSQL installer...')
    const depsDir = path.join(__dirname, '..', 'deps')
    if (!fs.existsSync(depsDir)) {
      fs.mkdirSync(depsDir, { recursive: true })
    }

    const installerPath = path.join(depsDir, `postgresql-${PG_VERSION}-installer.exe`)

    if (!fs.existsSync(installerPath)) {
      await downloadFile(PG_INSTALLER_URL, installerPath)
      onLog('✓ Downloaded PostgreSQL installer')
    } else {
      onLog('Using cached PostgreSQL installer')
    }

    const generatedPassword = 'POS_Admin_2026!' // Should be secure and unique
    onLog(`Installing PostgreSQL (this may take a few minutes)...`)

    // Silent install PostgreSQL
    execSync(
      `"${installerPath}" --mode unattended --superpassword "${generatedPassword}" --serverport 5432 --locale en_US --install_runtimes 1`,
      { stdio: 'pipe', timeout: 300000 }
    )

    onLog('✓ PostgreSQL installed successfully')
    return PSQL_PATH
  } catch (error) {
    throw new Error(`PostgreSQL installation failed: ${error.message}`)
  }
}

const createDatabase = async (psqlPath, onLog) => {
  try {
    const password = 'POS_Admin_2026!'
    const dbUser = 'pos_central_user'
    const dbPassword = 'pos_secure_2024!'
    const dbName = 'restaurant_pos_central'

    onLog('Checking database...')

    const sqlScript = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${dbUser}') THEN
    CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';
  END IF;
END $$;

SELECT 'CREATE DATABASE ${dbName} OWNER ${dbUser}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbName}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};
\\\\c ${dbName}
GRANT ALL ON SCHEMA public TO ${dbUser};
`.trim()

    // Save SQL to temp file
    const tempSqlFile = path.join(require('os').tmpdir(), 'pos-setup.sql')
    fs.writeFileSync(tempSqlFile, sqlScript)

    // Execute SQL script
    const env = { ...process.env, PGPASSWORD: password }
    execSync(
      `"${psqlPath}" -U postgres -h 127.0.0.1 -p 5432 -f "${tempSqlFile}"`,
      { env, stdio: 'pipe' }
    )

    fs.unlinkSync(tempSqlFile)
    onLog('✓ Database and user created successfully')
  } catch (error) {
    throw new Error(`Database setup failed: ${error.message}`)
  }
}

module.exports = { installPostgreSQL, createDatabase }
