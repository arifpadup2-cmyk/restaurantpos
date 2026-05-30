'use strict'

/**
 * POS Log Uploader
 * On startup and on reconnect, uploads ERROR/CRITICAL log entries
 * from the last 7 days to the cloud server.
 * Keeps a small local "upload cursor" so entries aren't sent twice.
 */

const fs   = require('fs')
const path = require('path')
const http  = require('http')
const https = require('https')

const logger = require('./logger')

// Track which entries have been uploaded (stored as set of "file:lineNumber")
let _uploadedSet   = new Set()
let _cursorFile    = null
let _uploading     = false
let _apiUrl        = ''
let _apiKey        = ''

function init (userDataPath, apiUrl, apiKey) {
  _apiUrl     = (apiUrl || '').replace(/\/+$/, '')
  _apiKey     = apiKey || ''
  _cursorFile = path.join(userDataPath, 'log-upload-cursor.json')
  _loadCursor()
}

function setApiUrl (url) { _apiUrl = (url || '').replace(/\/+$/, '') }
function setApiKey (key) { _apiKey = key || '' }

// ── Cursor persistence ────────────────────────────────────────────────────────
function _loadCursor () {
  try {
    if (fs.existsSync(_cursorFile)) {
      const data = JSON.parse(fs.readFileSync(_cursorFile, 'utf8'))
      _uploadedSet = new Set(data.uploaded || [])
      // Keep cursor small — only last 10k entries
      if (_uploadedSet.size > 10000) _uploadedSet = new Set()
    }
  } catch (_) {}
}

function _saveCursor () {
  try {
    fs.writeFileSync(_cursorFile, JSON.stringify({ uploaded: [..._uploadedSet].slice(-10000) }), 'utf8')
  } catch (_) {}
}

// ── Collect uploadable entries ────────────────────────────────────────────────
function _collectEntries () {
  const logDir = logger.getLogDir()
  if (!logDir || !fs.existsSync(logDir)) return []

  const cutoff  = Date.now() - 7 * 24 * 60 * 60 * 1000   // 7 days
  const entries = []

  const files = fs.readdirSync(logDir)
    .filter(f => f.endsWith('.log'))
    .map(f => ({ f, mtime: fs.statSync(path.join(logDir, f)).mtimeMs }))
    .filter(({ mtime }) => mtime > cutoff)
    .map(({ f }) => f)

  for (const file of files) {
    const lines = logger.readLogFile(path.join(logDir, file), 5000)
    lines.forEach((line, idx) => {
      const key = `${file}:${idx}`
      if (_uploadedSet.has(key)) return
      try {
        const entry = JSON.parse(line)
        // Only upload WARNING, ERROR, CRITICAL — not INFO (keeps bandwidth low)
        if (!['WARNING', 'ERROR', 'CRITICAL'].includes(entry.level)) return
        entries.push({ key, entry })
      } catch (_) {}
    })
  }

  return entries
}

// ── Upload to server ──────────────────────────────────────────────────────────
async function upload () {
  if (_uploading || !_apiUrl || !_apiKey) return
  _uploading = true

  try {
    const collected = _collectEntries()
    if (collected.length === 0) { _uploading = false; return }

    const cfg     = logger._context || {}
    const context = {
      brand_id:      cfg.brand_id      || '',
      outlet_id:     cfg.outlet_id     || '',
      outlet_code:   cfg.outlet_code   || '',
      outlet_name:   cfg.outlet_name   || '',
      terminal_name: cfg.terminal_name || '',
      version:       cfg._version      || '',
    }

    // Upload in batches of 100
    const BATCH = 100
    for (let i = 0; i < collected.length; i += BATCH) {
      const slice   = collected.slice(i, i + BATCH)
      const entries = slice.map(({ entry }) => entry)

      const ok = await _post('/terminal-logs/upload', { entries, context })
      if (ok) {
        slice.forEach(({ key }) => _uploadedSet.add(key))
        _saveCursor()
      } else {
        break   // Stop on failure — will retry on next startup
      }
    }

    logger.info('log-uploader', 'app', 'upload_complete', {
      count: collected.length,
    })
  } catch (e) {
    logger.warn('log-uploader', 'app', 'upload_failed', { error: e.message })
  } finally {
    _uploading = false
  }
}

// ── HTTP POST helper ──────────────────────────────────────────────────────────
function _post (endpoint, body) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify(body)
      const url     = new URL(_apiUrl + endpoint)
      const lib     = url.protocol === 'https:' ? https : http
      const req     = lib.request({
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-api-key':      _apiKey,
        },
      }, (res) => {
        let data = ''
        res.on('data', d => { data += d })
        res.on('end', () => {
          try { resolve(JSON.parse(data).ok === true) }
          catch { resolve(false) }
        })
      })
      req.setTimeout(10000, () => { req.destroy(); resolve(false) })
      req.on('error', () => resolve(false))
      req.write(payload)
      req.end()
    } catch (_) {
      resolve(false)
    }
  })
}

module.exports = { init, upload, setApiUrl, setApiKey }
