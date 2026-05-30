/**
 * POS Auto-Update Main Process Handler
 * Handles downloads and installations in Electron main process
 */

const { ipcMain, app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class AutoUpdateMain {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.setupIpcHandlers();
  }

  setupIpcHandlers() {
    // Handle update download request from renderer
    ipcMain.on('download-update', async (event, { url }) => {
      console.log('[AutoUpdate-Main] Downloading update from:', url);
      this.downloadUpdate(url, event);
    });

    // Handle install update request
    ipcMain.on('install-update', (event, { filePath }) => {
      console.log('[AutoUpdate-Main] Installing update:', filePath);
      this.installUpdate(filePath);
    });
  }

  /**
   * Download update file
   */
  downloadUpdate(url, event) {
    const downloadDir = path.join(app.getPath('downloads'));
    const fileName = url.split('/').pop() || 'restaurant-pos-update.exe';
    const filePath = path.join(downloadDir, fileName);

    console.log('[AutoUpdate-Main] Download path:', filePath);

    const https = require('https');
    const fileStream = fs.createWriteStream(filePath);
    let downloadedBytes = 0;
    let totalBytes = 0;

    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        console.log('[AutoUpdate-Main] Redirected to:', redirectUrl);
        fileStream.close();
        fs.unlink(filePath, () => {});
        return this.downloadUpdate(redirectUrl, event);
      }

      if (response.statusCode !== 200) {
        fileStream.close();
        fs.unlink(filePath, () => {});
        event.reply('update-download-error', `HTTP ${response.statusCode}`);
        return;
      }

      totalBytes = parseInt(response.headers['content-length'], 10);
      console.log('[AutoUpdate-Main] Download size:', totalBytes, 'bytes');

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const percent = Math.round((downloadedBytes / totalBytes) * 100);
        event.reply('update-download-progress', percent);
      });

      response.pipe(fileStream);
    });

    request.on('error', (error) => {
      console.error('[AutoUpdate-Main] Download error:', error);
      fileStream.close();
      fs.unlink(filePath, () => {});
      event.reply('update-download-error', error.message);
    });

    fileStream.on('finish', () => {
      fileStream.close();
      console.log('[AutoUpdate-Main] Download complete:', filePath);
      event.reply('update-downloaded', filePath);
    });

    fileStream.on('error', (error) => {
      console.error('[AutoUpdate-Main] File write error:', error);
      fs.unlink(filePath, () => {});
      event.reply('update-download-error', error.message);
    });
  }

  /**
   * Install update (run installer and close app)
   */
  installUpdate(filePath) {
    try {
      // Verify file exists
      if (!fs.existsSync(filePath)) {
        throw new Error('Update file not found: ' + filePath);
      }

      console.log('[AutoUpdate-Main] Running installer:', filePath);

      // Run the installer with elevated privileges
      // Using detached process so it continues after app closes
      exec(`"${filePath}"`, {
        detached: true,
        stdio: 'ignore'
      }, (error) => {
        if (error) {
          console.error('[AutoUpdate-Main] Error running installer:', error);
          dialog.showErrorBox('Update Error', 'Failed to run installer. Please update manually.');
        }
      });

      // Close the app after 1 second (gives installer time to start)
      setTimeout(() => {
        app.quit();
      }, 1000);
    } catch (error) {
      console.error('[AutoUpdate-Main] Install error:', error);
      dialog.showErrorBox('Update Error', error.message);
    }
  }
}

module.exports = AutoUpdateMain;
