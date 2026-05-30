let systemStatus = {}
let installMode = null // 'server' or 'terminal'
let serverIP = null

const showScreen = (screenId) => {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none')
  document.getElementById(screenId).style.display = 'flex'
}

const goToWelcome = () => {
  showScreen('welcome-screen')
}

const selectServerSetup = () => {
  installMode = 'server'
  showScreen('server-check-screen')
  checkSystem()
}

// Skip Server Info screen - go directly to installation
const proceedToInstall = () => {
  startServerInstallation()
}

const selectTerminalSetup = () => {
  installMode = 'terminal'
  showScreen('terminal-check-screen')
  checkTerminalSystem()
}

const goToServerCheck = () => {
  showScreen('server-check-screen')
}

const goToServerInfo = () => {
  showScreen('server-info-screen')
}

const startServerInstallation = async () => {
  // Don't ask for outlet details - they'll be configured in POS later
  showScreen('server-installing-screen')
  clearLog('server')

  window.installAPI.startInstall({
    mode: 'server',
    brandId: 'DEFAULT',
    outletId: 'DEFAULT',
    outletCode: 'DEFAULT'
  })
}

const startTerminalInstallation = async () => {
  const serverIp = document.getElementById('server-ip').value

  if (!serverIp.trim()) {
    alert('Please enter server IP address')
    return
  }

  showScreen('terminal-installing-screen')
  clearLog('terminal')

  window.installAPI.startInstall({
    mode: 'terminal',
    serverIP: serverIp
  })
}

const verifyServerConnection = async () => {
  const serverIp = document.getElementById('server-ip').value
  if (!serverIp.trim()) {
    alert('Please enter server IP')
    return
  }

  document.getElementById('verify-btn').textContent = 'Verifying...'
  document.getElementById('verify-btn').disabled = true

  try {
    // Try to connect to server:3001
    const response = await fetch(`http://${serverIp}:3001/health`, { timeout: 5000 })
    if (response.ok) {
      serverIP = serverIp
      document.getElementById('verify-btn').textContent = 'Verified ✓'
      setTimeout(() => startTerminalInstallation(), 500)
    } else {
      throw new Error('Server not responding')
    }
  } catch (error) {
    alert(`Could not connect to server at ${serverIp}:3001. Please check the IP and try again.`)
    document.getElementById('verify-btn').textContent = 'Verify Connection'
    document.getElementById('verify-btn').disabled = false
  }
}

const checkSystem = async () => {
  try {
    const result = await window.installAPI.checkSystem()

    updateCheck('nodejs', result.nodejs)
    updateCheck('postgresql', result.psql)
    updateCheck('ports', result.portsAvailable)

    systemStatus = result

    if (result.nodejs && result.psql && result.portsAvailable) {
      document.getElementById('proceed-btn').style.display = 'block'
    }
  } catch (error) {
    updateCheck('nodejs', false, error.message)
    updateCheck('postgresql', false, error.message)
    updateCheck('ports', false, error.message)
  }
}

const checkTerminalSystem = async () => {
  try {
    const result = await window.installAPI.checkSystem()
    updateCheck('ports-term', result.portsAvailable)
    document.getElementById('verify-btn').style.display = 'block'
  } catch (error) {
    updateCheck('ports-term', false, error.message)
  }
}

const updateCheck = (id, status, message = '') => {
  const element = document.getElementById(`check-${id}`)
  if (!element) return

  if (status) {
    element.innerHTML = `<span class="check-icon">✓</span><span>${element.querySelector('span:last-child')?.textContent || 'Check'}</span>`
    element.classList.add('done')
  } else {
    element.innerHTML = `<span class="check-icon error">✗</span><span>${element.querySelector('span:last-child')?.textContent || 'Check'}</span>`
    element.classList.add('error')
  }
}

const addLog = (message, mode = installMode) => {
  const logId = mode === 'terminal' ? 'install-log-term' : 'install-log-server'
  const logDiv = document.getElementById(logId)
  if (!logDiv) return

  const line = document.createElement('div')
  line.className = 'log-line'
  line.textContent = message
  logDiv.appendChild(line)
  logDiv.scrollTop = logDiv.scrollHeight
}

const clearLog = (mode = installMode) => {
  const logId = mode === 'terminal' ? 'install-log-term' : 'install-log-server'
  const element = document.getElementById(logId)
  if (element) element.innerHTML = ''
}

// Listen for progress updates
window.installAPI.onProgress((data) => {
  const progressBarId = installMode === 'terminal' ? 'progress-bar-term' : 'progress-bar'
  const progressTextId = installMode === 'terminal' ? 'progress-text-term' : 'progress-text'

  const percentage = (data.step / data.total) * 100
  const bar = document.getElementById(progressBarId)
  const text = document.getElementById(progressTextId)

  if (bar) bar.style.width = percentage + '%'
  if (text) text.textContent = `Step ${data.step}/${data.total}: ${data.message}`
})

window.installAPI.onLog((message) => {
  addLog(message)
})

window.installAPI.onComplete((data) => {
  if (installMode === 'server') {
    document.getElementById('complete-ip').textContent = data.ip
    document.getElementById('complete-url').textContent = `http://${data.ip}:3001`
    showScreen('server-complete-screen')
  } else {
    showScreen('terminal-complete-screen')
  }
})

window.installAPI.onError((data) => {
  addLog(`ERROR at ${data.step}: ${data.message}`)
  setTimeout(() => {
    alert(`Installation failed: ${data.message}`)
    showScreen('welcome-screen')
  }, 2000)
})

const openBackOffice = () => {
  const ip = document.getElementById('complete-ip').textContent
  if (ip && ip !== '192.168.1.100') {
    window.installAPI.openBackOffice?.(`http://${ip}:3001`)
  } else {
    window.installAPI.openBackOffice?.('http://localhost:3001')
  }
}

const launchPOS = () => {
  // Launch the POS app
  window.installAPI.launchPOS?.()
}

const closeInstaller = () => {
  window.close?.()
}
