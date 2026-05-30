/**
 * POS Auto-Update UI Integration
 * Handles update checking and user interface for POS
 * Inject this script into the login screen
 */

const { ipcRenderer } = require('electron');
const AutoUpdate = require('../auto-update');

let autoUpdater = null;
let currentUpdate = null;
let checkInterval = null;
let countdownInterval = null;
let lastCheckTime = null;
const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Initialize auto-update system
 */
function initializeAutoUpdate() {
  console.log('[UI] Initializing auto-update system...');

  // Use IPC-based check (nodeIntegration=false means require() won't work)
  if (window.posAPI?.checkForUpdates) {
    loadLastCheckTime();
    checkForUpdatesOnStartup();
    startCountdownTimer();
    setupEventListeners();
    checkInterval = setInterval(checkForUpdatesOnStartup, CHECK_INTERVAL);
  }
}

  // Setup event listeners
  setupEventListeners();

  // Start countdown timer
  startCountdownTimer();

  // Schedule periodic checks every 4 hours
  checkInterval = setInterval(() => {
    checkForUpdatesOnStartup();
  }, CHECK_INTERVAL);
}

/**
 * Load last check time from localStorage
 */
function loadLastCheckTime() {
  try {
    const stored = localStorage.getItem('last-update-check');
    if (stored) {
      lastCheckTime = new Date(parseInt(stored, 10));
    }
  } catch (e) {
    console.warn('Could not load last check time:', e);
  }
}

/**
 * Save last check time to localStorage
 */
function saveLastCheckTime() {
  try {
    localStorage.setItem('last-update-check', Date.now().toString());
    lastCheckTime = new Date();
    updateCountdownDisplay();
  } catch (e) {
    console.warn('Could not save last check time:', e);
  }
}

/**
 * Display current version in login screen
 */
function displayCurrentVersion() {
  const versionBadge = document.getElementById('version-badge');
  const versionCurrent = document.getElementById('version-current');
  const versionCheckIndicator = document.getElementById('version-check-indicator');
  const versionDate = document.getElementById('version-badge-date');

  if (!versionBadge || !versionCurrent) return;

  const version = autoUpdater.currentVersion;
  versionCurrent.textContent = `v${version}`;

  // Show checking indicator
  versionCheckIndicator.className = 'version-check-indicator checking';
  versionCheckIndicator.title = 'Checking for updates...';

  // Show "Checking for updates..."
  if (versionDate) {
    versionDate.textContent = '⏳ Checking for updates...';
    versionDate.style.color = '#f59e0b';
  }
}

/**
 * Check for updates on startup
 */
async function checkForUpdatesOnStartup() {
  console.log('[UI] Checking for updates...');

  try {
    const update = await autoUpdater.checkForUpdates();

    // Save check time
    saveLastCheckTime();

    if (update) {
      console.log('[UI] Update available:', update.version);
      currentUpdate = update;
      showUpdateNotification(update);
      updateVersionBadge(update, 'outdated');
    } else {
      console.log('[UI] Already on latest version');
      updateVersionBadge(null, 'latest');
    }
  } catch (error) {
    console.error('[UI] Update check error:', error);
    updateVersionBadge(null, 'error');
  }
}

/**
 * Show update notification banner
 */
function showUpdateNotification(update) {
  const notification = document.getElementById('update-notification');
  if (!notification) return;

  // Update notification content
  document.getElementById('update-version-new').textContent = update.version;
  document.getElementById('update-release-date-banner').textContent = formatDateShort(update.releaseDate);

  // Show notification
  notification.classList.add('show');

  // Setup buttons
  const btnInstall = document.getElementById('update-btn-install');
  const btnLater = document.getElementById('update-btn-later');

  if (btnInstall) {
    btnInstall.onclick = () => {
      hideUpdateNotification();
      showUpdateModal(update);
    };
  }

  if (btnLater) {
    btnLater.onclick = () => hideUpdateNotification();
  }
}

/**
 * Hide update notification banner
 */
function hideUpdateNotification() {
  const notification = document.getElementById('update-notification');
  if (notification) {
    notification.classList.remove('show');
  }
}

/**
 * Show detailed update modal
 */
function showUpdateModal(update) {
  const modal = document.getElementById('update-modal');
  if (!modal) return;

  // Populate modal content
  document.getElementById('update-version-current').textContent = autoUpdater.currentVersion;
  document.getElementById('update-version-target').textContent = update.version;
  document.getElementById('update-release-datetime').innerHTML =
    `<strong>Released:</strong> ${update.releaseDate}<br>
     <strong>Version:</strong> v${update.version}<br>
     <strong>Updated by:</strong> Restaurant POS Development Team`;

  // Format and show release notes
  const notesEl = document.getElementById('update-release-notes');
  if (notesEl) {
    const notes = formatReleaseNotes(update.releaseNotes);
    notesEl.innerHTML = notes || '<em>No release notes available</em>';
  }

  // Update status
  document.getElementById('update-status').textContent = 'Ready to install - Will close POS and run installer';

  // Show modal
  modal.classList.add('show');

  // Setup buttons
  const btnInstall = document.getElementById('update-modal-install');
  const btnCancel = document.getElementById('update-modal-cancel');

  if (btnInstall) {
    btnInstall.onclick = () => handleInstallUpdate(update);
  }

  if (btnCancel) {
    btnCancel.onclick = () => {
      hideUpdateModal();
      showUpdateNotification(update);
    };
  }
}

/**
 * Hide update modal
 */
function hideUpdateModal() {
  const modal = document.getElementById('update-modal');
  if (modal) {
    modal.classList.remove('show');
  }
}

/**
 * Handle install update
 */
async function handleInstallUpdate(update) {
  if (!update || !update.downloadUrl) {
    alert('Download URL not available');
    return;
  }

  console.log('[UI] Starting update installation...');

  // Disable buttons
  const btnInstall = document.getElementById('update-modal-install');
  if (btnInstall) btnInstall.disabled = true;

  // Show progress
  const progressContainer = document.getElementById('update-progress-container');
  if (progressContainer) progressContainer.classList.add('show');

  try {
    // Download update
    const filePath = await autoUpdater.downloadUpdate(update.downloadUrl);
    console.log('[UI] Update downloaded:', filePath);

    // Update status
    document.getElementById('update-status').textContent = 'Downloaded successfully - Installing...';

    // Install update
    setTimeout(() => {
      autoUpdater.installUpdate(filePath);
    }, 500);
  } catch (error) {
    console.error('[UI] Install error:', error);
    alert('Failed to install update: ' + error.message);

    // Re-enable button
    if (btnInstall) btnInstall.disabled = false;

    // Hide progress
    if (progressContainer) progressContainer.classList.remove('show');
  }
}

/**
 * Update version badge
 */
function updateVersionBadge(update, status) {
  const indicator = document.getElementById('version-check-indicator');
  const badge = document.getElementById('version-badge-date');

  if (!indicator || !badge) return;

  if (status === 'outdated' && update) {
    indicator.className = 'version-check-indicator outdated';
    indicator.title = `New version ${update.version} available`;
    badge.innerHTML = `
      <div style="margin-top: 4px; font-size: 11px;">
        <div>🔴 Update Available: v${update.version}</div>
        <div style="margin-top: 2px;">Released: ${formatDateFull(update.releaseDate)}</div>
      </div>
    `;
    badge.style.color = '#ef4444';
  } else if (status === 'latest') {
    indicator.className = 'version-check-indicator latest';
    indicator.title = 'Latest version installed';
    const lastCheck = lastCheckTime ? formatDateFull(lastCheckTime) : 'Just now';
    badge.innerHTML = `
      <div style="margin-top: 4px; font-size: 11px;">
        <div>✅ Up to date</div>
        <div style="margin-top: 2px;">Last check: ${lastCheck}</div>
        <div id="countdown-display" style="margin-top: 2px; color: #6b7280;"></div>
      </div>
    `;
    badge.style.color = '#10b981';
  } else {
    indicator.className = 'version-check-indicator';
    badge.textContent = '(checking...)';
  }
}

/**
 * Setup event listeners for download progress
 */
function setupEventListeners() {
  ipcRenderer.on('update-download-progress', (event, percent) => {
    const progressFill = document.getElementById('update-progress-fill');
    const progressText = document.getElementById('update-progress-text');

    if (progressFill) progressFill.style.width = percent + '%';
    if (progressText) progressText.textContent = percent + '%';

    console.log('[UI] Download progress:', percent + '%');
  });

  ipcRenderer.on('update-error', (event, error) => {
    console.error('[UI] Update error:', error);
    alert('Update error: ' + error);
  });
}

/**
 * Format release notes as HTML
 */
function formatReleaseNotes(notes) {
  if (!notes) return '';

  // Convert markdown-like format to HTML
  let html = notes
    .replace(/#{1,6}\s+/g, '<strong>') // Headers
    .replace(/\n\n/g, '</strong><br><br>')
    .replace(/\n- /g, '<br>• ')
    .replace(/\n\* /g, '<br>✓ ')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px">$1</code>');

  return html;
}

/**
 * Format date for display (full version with seconds)
 */
function formatDateFull(dateObj) {
  try {
    const date = new Date(dateObj);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
  } catch {
    return String(dateObj);
  }
}

/**
 * Format date for display (short version)
 */
function formatDateShort(dateStr) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  } catch {
    return dateStr;
  }
}

/**
 * Start countdown timer that updates every second
 */
function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    updateCountdownDisplay();
  }, 1000); // Update every second

  updateCountdownDisplay(); // Initial display
}

/**
 * Update countdown display
 */
function updateCountdownDisplay() {
  const countdownEl = document.getElementById('countdown-display');
  if (!countdownEl) return;

  if (!lastCheckTime) {
    countdownEl.textContent = 'Next check: calculating...';
    return;
  }

  const now = new Date();
  const nextCheckTime = new Date(lastCheckTime.getTime() + CHECK_INTERVAL);
  const secondsUntilNextCheck = Math.max(0, Math.floor((nextCheckTime - now) / 1000));

  const hours = Math.floor(secondsUntilNextCheck / 3600);
  const mins = Math.floor((secondsUntilNextCheck % 3600) / 60);
  const secs = secondsUntilNextCheck % 60;

  const countdownText = `Next check: ${hours}h ${mins}m ${secs}s`;
  countdownEl.textContent = countdownText;
}

/**
 * Manual update check (can be called from menu)
 */
async function manualUpdateCheck() {
  console.log('[UI] Manual update check...');

  const indicator = document.getElementById('version-check-indicator');
  if (indicator) indicator.className = 'version-check-indicator checking';

  try {
    const update = await autoUpdater.checkForUpdates();

    if (update) {
      currentUpdate = update;
      showUpdateNotification(update);
      updateVersionBadge(update, 'outdated');
      console.log('[UI] Update found:', update.version);
    } else {
      alert('You are already using the latest version!');
      updateVersionBadge(null, 'latest');
    }
  } catch (error) {
    console.error('[UI] Manual check error:', error);
    alert('Check failed: ' + error.message);
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeAutoUpdate,
    manualUpdateCheck,
    showUpdateModal,
    hideUpdateModal,
    currentVersion: () => autoUpdater?.currentVersion
  };
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAutoUpdate);
} else {
  initializeAutoUpdate();
}
