const { execSync } = require('child_process')
const fs = require('fs')
const net = require('net')
const path = require('path')

const detectNodeJS = () => {
  try {
    execSync('node --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const detectPostgreSQL = () => {
  const possiblePaths = [
    'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\18\\bin\\psql.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\17\\bin\\psql.exe'
  ]

  for (const psqlPath of possiblePaths) {
    if (fs.existsSync(psqlPath)) {
      return { found: true, path: psqlPath }
    }
  }

  return { found: false, path: null }
}

const isPortAvailable = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false)
      } else {
        resolve(true)
      }
    })

    server.once('listening', () => {
      server.close()
      resolve(true)
    })

    server.listen(port, '127.0.0.1')
  })
}

const checkPorts = async () => {
  const port3001Available = await isPortAvailable(3001)
  const port5432Available = await isPortAvailable(5432)
  return port3001Available && port5432Available
}

const detectSystem = async () => {
  const nodejs = detectNodeJS()
  const postgresql = detectPostgreSQL()
  const portsAvailable = await checkPorts()

  return {
    nodejs,
    psql: postgresql.found,
    psqlPath: postgresql.path,
    portsAvailable,
    all: nodejs && postgresql.found && portsAvailable
  }
}

module.exports = { detectSystem, detectPostgreSQL }
