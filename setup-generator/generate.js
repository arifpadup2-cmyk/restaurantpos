#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const chalk = require('chalk')

// Parse command line arguments
const args = process.argv.slice(2)
const config = {}

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2)
    const value = args[i + 1]
    if (value && !value.startsWith('--')) {
      config[key] = value
      i++
    }
  }
}

// Validate required fields
const required = ['outlet', 'code']
const missing = required.filter(key => !config[key])

if (missing.length > 0) {
  console.log(chalk.red('✗ Missing required arguments:'))
  console.log(chalk.gray('  --outlet <id>        Outlet ID (e.g., outlet-123)'))
  console.log(chalk.gray('  --code <code>        Outlet code (e.g., QAT001)'))
  console.log('')
  console.log(chalk.gray('Optional arguments:'))
  console.log(chalk.gray('  --serverIP <ip>      Server IP for terminals (e.g., 192.168.1.100)'))
  console.log(chalk.gray('  --serverPort <port>  Server port (default: 3001)'))
  console.log(chalk.gray('  --brandName <name>   Brand name (default: Restaurant POS)'))
  console.log(chalk.gray('  --output <path>      Output directory (default: ./output)'))
  console.log('')
  console.log(chalk.yellow('Usage:'))
  console.log(chalk.gray('  node generate.js --outlet outlet-123 --code QAT001'))
  console.log(chalk.gray('  node generate.js --outlet outlet-123 --code QAT001 --serverIP 192.168.1.100'))
  process.exit(1)
}

const outletId = config.outlet
const outletCode = config.code
const serverIP = config.serverIP || '192.168.1.100'
const serverPort = config.serverPort || '3001'
const brandName = config.brandName || 'Restaurant POS'
const outputDir = config.output || path.join(__dirname, 'output')

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

const installerDir = path.join(__dirname, '..', 'installer')
const distDir = path.join(installerDir, 'dist')

if (!fs.existsSync(distDir)) {
  console.log(chalk.red('✗ Installer not built yet!'))
  console.log(chalk.gray('Run: cd installer && npm run build'))
  process.exit(1)
}

console.log('')
console.log(chalk.cyan('╔════════════════════════════════════════════╗'))
console.log(chalk.cyan('║   Restaurant POS Setup File Generator   ║'))
console.log(chalk.cyan('╚════════════════════════════════════════════╝'))
console.log('')

// Create configuration
const setupConfig = {
  outletId,
  outletCode,
  brandName,
  serverIP,
  serverPort,
  createdAt: new Date().toISOString(),
  version: '2.0.0'
}

console.log(chalk.gray('Configuration:'))
console.log(chalk.gray(`  Brand: ${brandName}`))
console.log(chalk.gray(`  Outlet: ${outletId} (${outletCode})`))
console.log(chalk.gray(`  Server: ${serverIP}:${serverPort}`))
console.log('')

// Create temporary config file
const tempConfigPath = path.join(installerDir, 'embedded-config.json')
fs.writeFileSync(tempConfigPath, JSON.stringify(setupConfig, null, 2))
console.log(chalk.green('✓ Config created'))

// Copy installer exe and inject config
const sourceExe = path.join(distDir, 'Restaurant POS Installer Setup 1.0.0.exe')
const outputExe = path.join(outputDir, `setup-${outletId}.exe`)

try {
  // For now, just copy the installer (config will be read from embedded-config.json)
  fs.copyFileSync(sourceExe, outputExe)
  console.log(chalk.green(`✓ Setup file created`))
  console.log(chalk.gray(`  Output: ${outputExe}`))

  // Also copy the config next to it for reference
  const configOutput = path.join(outputDir, `setup-${outletId}-config.json`)
  fs.copyFileSync(tempConfigPath, configOutput)
  console.log(chalk.green('✓ Config file saved'))
  console.log(chalk.gray(`  Config: ${configOutput}`))

  console.log('')
  console.log(chalk.cyan('Setup file ready for distribution!'))
  console.log('')
  console.log(chalk.gray('Installation instructions:'))
  console.log(chalk.gray(`  1. Copy setup-${outletId}.exe to server/terminal machines`))
  console.log(chalk.gray('  2. Run the installer'))
  console.log(chalk.gray('  3. Choose "Server Setup" or "Terminal Setup"'))
  console.log(chalk.gray('  4. Follow the on-screen instructions'))
  console.log('')

} catch (error) {
  console.log(chalk.red(`✗ Error: ${error.message}`))
  process.exit(1)
} finally {
  // Clean up temporary config
  if (fs.existsSync(tempConfigPath)) {
    fs.unlinkSync(tempConfigPath)
  }
}
