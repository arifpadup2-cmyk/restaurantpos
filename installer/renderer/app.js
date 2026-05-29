let systemStatus = {}

const showScreen = (screenId) => {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none')
  document.getElementById(screenId).style.display = 'flex'
}

const goToSystemCheck = async () => {
  showScreen('system-check-screen')
  checkSystem()
}

const goToRestaurantInfo = () => {
  showScreen('restaurant-info-screen')
  document.getElementById('restaurant-name').focus()
}

const startInstallation = async () => {
  const restaurantName = document.getElementById('restaurant-name').value
  if (!restaurantName.trim()) {
    alert('Please enter a restaurant name')
    return
  }

  showScreen('installing-screen')
  clearLog()

  window.installAPI.startInstall({ restaurantName })
}

const goToRestaurantInfo2 = () => {
  showScreen('restaurant-info-screen')
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

const updateCheck = (id, status, message = '') => {
  const element = document.getElementById(`check-${id}`)
  if (status) {
    element.innerHTML = `<span class="check-icon">✓</span><span>${element.querySelector('span:last-child').textContent}</span>`
    element.classList.add('done')
  } else {
    element.innerHTML = `<span class="check-icon error">✗</span><span>${element.querySelector('span:last-child').textContent}</span>`
    element.classList.add('error')
  }
}

const addLog = (message) => {
  const logDiv = document.getElementById('install-log')
  const line = document.createElement('div')
  line.className = 'log-line'
  line.textContent = message
  logDiv.appendChild(line)
  logDiv.scrollTop = logDiv.scrollHeight
}

const clearLog = () => {
  document.getElementById('install-log').innerHTML = ''
}

// Listen for progress updates
window.installAPI.onProgress((data) => {
  const percentage = (data.step / data.total) * 100
  document.getElementById('progress-bar').style.width = percentage + '%'
  document.getElementById('progress-text').textContent = `Step ${data.step}/${data.total}: ${data.message}`
})

window.installAPI.onLog((message) => {
  addLog(message)
})

window.installAPI.onComplete((data) => {
  document.getElementById('server-url').textContent = data.ip
  document.getElementById('admin-url').textContent = data.adminUrl
  document.getElementById('password').textContent = data.credentials.password
  showScreen('complete-screen')
})

window.installAPI.onError((data) => {
  addLog(`ERROR at ${data.step}: ${data.message}`)
  setTimeout(() => {
    alert(`Installation failed: ${data.message}`)
    showScreen('restaurant-info-screen')
  }, 2000)
})

const launchPOS = () => {
  // Launch the POS app (this would be handled by main.js)
  window.installAPI.launchPOS?.()
}

const closeInstaller = () => {
  window.close?.()
}
