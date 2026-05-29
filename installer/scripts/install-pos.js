const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const installPOS = async (onLog) => {
  try {
    const appDir = path.join(__dirname, '..', 'app-resources')
    const posInstallerPath = path.join(appDir, 'pos-installer.exe')

    onLog('Checking POS installer...')

    if (!fs.existsSync(posInstallerPath)) {
      throw new Error('POS installer not found. Please ensure the installer includes the POS Setup.exe file.')
    }

    onLog('Running silent POS installation...')
    execSync(`"${posInstallerPath}" /S`, {
      stdio: 'pipe',
      timeout: 180000
    })

    onLog('✓ POS application installed successfully')
  } catch (error) {
    throw new Error(`POS installation failed: ${error.message}`)
  }
}

module.exports = { installPOS }
