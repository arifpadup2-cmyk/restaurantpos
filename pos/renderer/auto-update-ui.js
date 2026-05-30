/**
 * POS Auto-Update UI
 * nodeIntegration=false — uses window.posAPI (IPC) only. No require().
 */

let currentUpdate    = null;
let checkInterval    = null;
let countdownInterval = null;
let lastCheckTime    = null;
const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

// ── Init ──────────────────────────────────────────────────────────────────────
function initializeAutoUpdate() {
  if (!window.posAPI?.checkForUpdates) return;
  loadLastCheckTime();
  checkForUpdatesOnStartup();
  startCountdownTimer();
  setupEventListeners();
  checkInterval = setInterval(checkForUpdatesOnStartup, CHECK_INTERVAL);
}

// ── Last check time ───────────────────────────────────────────────────────────
function loadLastCheckTime() {
  try {
    const stored = localStorage.getItem('last-update-check');
    if (stored) lastCheckTime = new Date(parseInt(stored, 10));
  } catch (_) {}
}

function saveLastCheckTime() {
  try {
    localStorage.setItem('last-update-check', Date.now().toString());
    lastCheckTime = new Date();
    updateCountdownDisplay();
  } catch (_) {}
}

// ── Check for updates ─────────────────────────────────────────────────────────
async function checkForUpdatesOnStartup() {
  try {
    const update = await window.posAPI.checkForUpdates();
    saveLastCheckTime();
    if (update) {
      currentUpdate = update;
      showUpdateNotification(update);
      updateVersionBadge(update, 'outdated');
    } else {
      updateVersionBadge(null, 'latest');
    }
  } catch (_) {
    updateVersionBadge(null, 'error');
  }
}

// ── Version badge ─────────────────────────────────────────────────────────────
function updateVersionBadge(update, status) {
  const indicator = document.getElementById('version-check-indicator');
  const badge     = document.getElementById('version-badge-date');
  if (!indicator || !badge) return;

  if (status === 'outdated' && update) {
    indicator.className = 'version-check-indicator outdated';
    badge.innerHTML = `<div style="margin-top:4px;font-size:11px">
      <div>🔴 Update Available: v${update.version}</div>
      <div style="margin-top:2px">Released: ${formatDateFull(update.releaseDate)}</div>
    </div>`;
    badge.style.color = '#ef4444';
  } else if (status === 'latest') {
    indicator.className = 'version-check-indicator latest';
    const lastCheck = lastCheckTime ? formatDateFull(lastCheckTime) : 'Just now';
    badge.innerHTML = `<div style="margin-top:4px;font-size:11px">
      <div>✅ Up to date</div>
      <div style="margin-top:2px">Last check: ${lastCheck}</div>
      <div id="countdown-display" style="margin-top:2px;color:#6b7280"></div>
    </div>`;
    badge.style.color = '#10b981';
  } else {
    indicator.className = 'version-check-indicator';
    badge.textContent = '(checking...)';
  }
}

// ── Notification banner ───────────────────────────────────────────────────────
function showUpdateNotification(update) {
  const el = document.getElementById('update-notification');
  if (!el) return;
  const vn = document.getElementById('update-version-new');
  const rd = document.getElementById('update-release-date-banner');
  if (vn) vn.textContent = update.version;
  if (rd) rd.textContent = formatDateShort(update.releaseDate);
  el.classList.add('show');
  const btnInstall = document.getElementById('update-btn-install');
  const btnLater   = document.getElementById('update-btn-later');
  if (btnInstall) btnInstall.onclick = () => { hideUpdateNotification(); showUpdateModal(update); };
  if (btnLater)   btnLater.onclick   = () => hideUpdateNotification();
}

function hideUpdateNotification() {
  document.getElementById('update-notification')?.classList.remove('show');
}

// ── Update modal ──────────────────────────────────────────────────────────────
function showUpdateModal(update) {
  const modal = document.getElementById('update-modal');
  if (!modal) return;
  const vc = document.getElementById('update-version-current');
  const vt = document.getElementById('update-version-target');
  const rd = document.getElementById('update-release-datetime');
  const st = document.getElementById('update-status');
  if (vc) vc.textContent = document.getElementById('version-current')?.textContent || '';
  if (vt) vt.textContent = update.version;
  if (rd) rd.innerHTML = `<strong>Released:</strong> ${update.releaseDate}<br><strong>Version:</strong> v${update.version}`;
  if (st) st.textContent = 'Ready to install';
  const notes = document.getElementById('update-release-notes');
  if (notes) notes.innerHTML = formatReleaseNotes(update.releaseNotes) || '<em>No release notes available</em>';
  modal.classList.add('show');
  const btnInstall = document.getElementById('update-modal-install');
  const btnCancel  = document.getElementById('update-modal-cancel');
  if (btnInstall) btnInstall.onclick = () => handleInstallUpdate(update);
  if (btnCancel)  btnCancel.onclick  = () => { hideUpdateModal(); showUpdateNotification(update); };
}

function hideUpdateModal() {
  document.getElementById('update-modal')?.classList.remove('show');
}

async function handleInstallUpdate(update) {
  if (!update?.downloadUrl) { alert('Download URL not available'); return; }
  const btnInstall = document.getElementById('update-modal-install');
  const progress   = document.getElementById('update-progress-container');
  if (btnInstall) btnInstall.disabled = true;
  if (progress)   progress.classList.add('show');
  try {
    await window.posAPI.startUpdateDownload();
  } catch (e) {
    alert('Update failed: ' + e.message);
    if (btnInstall) btnInstall.disabled = false;
    if (progress)   progress.classList.remove('show');
  }
}

// ── Event listeners (via posAPI IPC) ─────────────────────────────────────────
function setupEventListeners() {
  window.posAPI.onDownloadProgress((prog) => {
    const fill = document.getElementById('update-progress-fill');
    const txt  = document.getElementById('update-progress-text');
    if (fill) fill.style.width = (prog.percent || 0) + '%';
    if (txt)  txt.textContent  = Math.round(prog.percent || 0) + '%';
  });
  window.posAPI.onUpdateReady(() => {
    document.getElementById('update-progress-modal') && (document.getElementById('update-progress-modal').style.display = 'none');
    document.getElementById('update-ready-modal')    && (document.getElementById('update-ready-modal').style.display = 'flex');
  });
}

// ── Countdown timer ───────────────────────────────────────────────────────────
function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateCountdownDisplay, 1000);
  updateCountdownDisplay();
}

function updateCountdownDisplay() {
  const el = document.getElementById('countdown-display');
  if (!el || !lastCheckTime) return;
  const secs  = Math.max(0, Math.floor((lastCheckTime.getTime() + CHECK_INTERVAL - Date.now()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  el.textContent = `Next check: ${h}h ${m}m ${s}s`;
}

// ── Format helpers ────────────────────────────────────────────────────────────
function formatDateFull(d) {
  try {
    const dt = new Date(d);
    const p  = n => String(n).padStart(2,'0');
    return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
  } catch { return String(d); }
}

function formatDateShort(d) {
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

function formatReleaseNotes(notes) {
  if (!notes) return '';
  return notes
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n- /g, '<br>• ')
    .replace(/\n/g, '<br>');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAutoUpdate);
} else {
  initializeAutoUpdate();
}
