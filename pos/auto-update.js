/**
 * POS Auto-Update Module
 * Checks for new versions on startup and handles updates
 * Version: 1.0.0
 */

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const UPDATE_CHECK_URL = 'https://api.github.com/repos/arifpadup2-cmyk/restaurantpos/releases/latest';
const UPDATE_INTERVAL = 86400000; // 24 hours

class AutoUpdate {
  constructor() {
    this.currentVersion = require('./package.json').version;
    this.updateCheckTime = 0;
    this.updateAvailable = false;
    this.latestRelease = null;
  }

  /**
   * Check for updates from GitHub releases
   */
  async checkForUpdates() {
    try {
      const lastCheck = this.getLastUpdateCheckTime();
      const now = Date.now();

      // Only check once per 24 hours (or on first startup)
      if (now - lastCheck < UPDATE_INTERVAL && lastCheck !== 0) {
        console.log('[AutoUpdate] Last checked recently, skipping check');
        return null;
      }

      console.log('[AutoUpdate] Checking for updates...');

      const response = await fetch(UPDATE_CHECK_URL, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RestaurantPOS-Client'
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const release = await response.json();
      this.saveLastUpdateCheckTime();

      // Get release info
      const latestVersion = release.tag_name.replace('v', '');
      const releaseDate = new Date(release.published_at);
      const releaseDateStr = releaseDate.toLocaleString();

      console.log(`[AutoUpdate] Latest version: ${latestVersion} (Released: ${releaseDateStr})`);
      console.log(`[AutoUpdate] Current version: ${this.currentVersion}`);

      // Compare versions
      if (this.compareVersions(latestVersion, this.currentVersion) > 0) {
        console.log('[AutoUpdate] New version available!');

        this.updateAvailable = true;
        this.latestRelease = {
          version: latestVersion,
          releaseDate: releaseDateStr,
          releaseDateObj: releaseDate,
          releaseNotes: release.body || 'No release notes available',
          downloadUrl: this.getDownloadUrl(release.assets),
          releaseUrl: release.html_url,
          fileName: this.getFileName(release.assets)
        };

        return this.latestRelease;
      }

      console.log('[AutoUpdate] Already on latest version');
      return null;
    } catch (error) {
      console.error('[AutoUpdate] Check failed:', error.message);
      return null;
    }
  }

  /**
   * Get download URL from release assets
   */
  getDownloadUrl(assets) {
    if (!assets || !Array.isArray(assets)) return null;

    // Look for .exe file (POS Electron build)
    const exeAsset = assets.find(a => a.name.includes('POS') && a.name.endsWith('.exe'));
    if (exeAsset) return exeAsset.browser_download_url;

    // Fallback: first asset
    return assets[0]?.browser_download_url || null;
  }

  /**
   * Get file name from assets
   */
  getFileName(assets) {
    if (!assets || !Array.isArray(assets)) return null;
    const exeAsset = assets.find(a => a.name.includes('POS') && a.name.endsWith('.exe'));
    return exeAsset?.name || assets[0]?.name || 'restaurant-pos-update.exe';
  }

  /**
   * Compare semantic versions
   * Returns: > 0 if v1 > v2, < 0 if v1 < v2, 0 if equal
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(x => parseInt(x, 10) || 0);
    const parts2 = v2.split('.').map(x => parseInt(x, 10) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * Download update
   */
  async downloadUpdate(downloadUrl) {
    return new Promise((resolve, reject) => {
      ipcRenderer.send('download-update', { url: downloadUrl });

      // Listen for download events
      ipcRenderer.on('update-download-progress', (event, progress) => {
        console.log(`[AutoUpdate] Download progress: ${progress}%`);
      });

      ipcRenderer.once('update-downloaded', (event, filePath) => {
        console.log('[AutoUpdate] Update downloaded:', filePath);
        resolve(filePath);
      });

      ipcRenderer.once('update-download-error', (event, error) => {
        console.error('[AutoUpdate] Download error:', error);
        reject(new Error(error));
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        reject(new Error('Download timeout'));
      }, 600000);
    });
  }

  /**
   * Install and restart with update
   */
  installUpdate(filePath) {
    ipcRenderer.send('install-update', { filePath });
  }

  /**
   * Get last update check time
   */
  getLastUpdateCheckTime() {
    try {
      const configPath = path.join(
        process.env.APPDATA || process.env.HOME,
        'restaurant-pos',
        'update-check.json'
      );

      if (!fs.existsSync(configPath)) {
        return 0; // Never checked
      }

      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return data.lastCheck || 0;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Save last update check time
   */
  saveLastUpdateCheckTime() {
    try {
      const configDir = path.join(
        process.env.APPDATA || process.env.HOME,
        'restaurant-pos'
      );

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const configPath = path.join(configDir, 'update-check.json');
      const data = { lastCheck: Date.now() };
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[AutoUpdate] Failed to save check time:', e.message);
    }
  }

  /**
   * Get current version info
   */
  getVersionInfo() {
    return {
      currentVersion: this.currentVersion,
      updateAvailable: this.updateAvailable,
      latestRelease: this.latestRelease
    };
  }
}

// Export for use in main process and renderer
module.exports = AutoUpdate;
