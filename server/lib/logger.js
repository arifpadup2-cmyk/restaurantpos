'use strict'

/**
 * Server Activity & Error Logger
 * Writes structured JSON-line logs to daily rotating files.
 * File: server/logs/server_YYYY-MM-DD.log
 * Retention: 30 days
 */

const fs   = require('fs')
const path = require('path')
const os   = require('os')

// ── Sensitive field masking ───────────────────────────────────────────────────
const MASK_KEYS = new Set([
  'pin','password','pass','token','secret','api_key','apikey',
  'license_key','authorization','card_number','cvv','access_token',
  'refresh_token','db_pass','dbpass','new_password','old_password',
])

function maskValue(key, value) {
  if (MASK_KEYS.has(String(key).toLowerCase())) return '****'
  return value
}

function maskObject(obj, depth = 0) {
  if (depth > 4 || obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(v => maskObject(v, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = maskValue(k, typeof v === 'object' ? maskObject(v, depth + 1) : v)
  }
  return out
}

// ── State ─────────────────────────────────────────────────────────────────────
let _logDir = null

function init(baseDir) {
  _logDir = path.join(baseDir, 'logs')
  if (!fs.existsSync(_logDir)) fs.mkdirSync(_logDir, { recursive: true })
  cleanOldLogs()
}

function getLogDir() { return _logDir }

// ── File path ─────────────────────────────────────────────────────────────────
function getLogFilePath() {
  if (!_logDir) return null
  const date = new Date().toISOString().slice(0, 10)
  return path.join(_logDir, `server_${date}.log`)
}

// ── Write ─────────────────────────────────────────────────────────────────────
function write(level, module_name, action, context = {}, extra = {}) {
  const filePath = getLogFilePath()
  if (!filePath) { console.log(`[${level}] ${module_name} ${action}`); return }

  const entry = {
    timestamp:     new Date().toISOString(),
    level:         level.toUpperCase(),
    module:        module_name || 'server',
    action,
    // Request context
    user_id:       context.user_id       || '',
    user_name:     context.user_name     || '',
    user_role:     context.user_role     || '',
    brand_id:      context.brand_id      || '',
    brand_name:    context.brand_name    || '',
    outlet_id:     context.outlet_id     || '',
    outlet_code:   context.outlet_code   || '',
    outlet_name:   context.outlet_name   || '',
    terminal_id:   context.terminal_id   || '',
    ip:            context.ip            || '',
    method:        context.method        || '',
    path:          context.path          || '',
    ...maskObject(extra),
  }

  const line = JSON.stringify(entry) + '\n'
  try {
    fs.appendFileSync(filePath, line, 'utf8')
  } catch (_) {}

  // Also console.log for visibility
  if (level === 'ERROR' || level === 'CRITICAL') {
    console.error(`[${entry.timestamp}] [${level}] ${module_name} ${action}`, extra.error || '')
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
const info     = (mod, action, ctx, extra) => write('INFO',     mod, action, ctx, extra)
const warn     = (mod, action, ctx, extra) => write('WARNING',  mod, action, ctx, extra)
const error    = (mod, action, ctx, extra) => write('ERROR',    mod, action, ctx, extra)
const critical = (mod, action, ctx, extra) => write('CRITICAL', mod, action, ctx, extra)

function log(level, mod, action, ctx, extra) {
  write(level, mod, action, ctx, extra)
}

// ── Extract context from Express request ─────────────────────────────────────
function ctxFromReq(req) {
  const u = req.user || {}
  return {
    user_id:     u.id          || u.userId    || '',
    user_name:   u.username    || u.name      || '',
    user_role:   u.role        || (u.admin ? 'superadmin' : ''),
    brand_id:    u.brand_id    || req.headers['x-brand-id']    || '',
    outlet_id:   u.outlet_id   || req.headers['x-outlet-id']   || '',
    terminal_id: u.terminal_id || req.headers['x-terminal-id'] || '',
    ip:          req.ip        || req.socket?.remoteAddress     || '',
    method:      req.method    || '',
    path:        req.originalUrl || req.path || '',
  }
}

// ── Express middleware — logs every request ───────────────────────────────────
function requestLogger(req, res, next) {
  const start = Date.now()
  const ctx   = ctxFromReq(req)

  res.on('finish', () => {
    const ms     = Date.now() - start
    const level  = res.statusCode >= 500 ? 'ERROR'
                 : res.statusCode >= 400 ? 'WARNING'
                 : 'INFO'
    write(level, 'http', 'request', ctx, {
      status:   res.statusCode,
      duration_ms: ms,
    })
  })

  next()
}

// ── Cleanup old logs (>30 days) ───────────────────────────────────────────────
function cleanOldLogs() {
  if (!_logDir) return
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const files  = fs.readdirSync(_logDir).filter(f => f.endsWith('.log'))
    for (const f of files) {
      const fp   = path.join(_logDir, f)
      const stat = fs.statSync(fp)
      if (stat.mtimeMs < cutoff) fs.unlinkSync(fp)
    }
  } catch (_) {}
}

// ── List log files ────────────────────────────────────────────────────────────
function listLogFiles() {
  if (!_logDir || !fs.existsSync(_logDir)) return []
  return fs.readdirSync(_logDir)
    .filter(f => f.endsWith('.log'))
    .map(f => {
      const fp   = path.join(_logDir, f)
      const stat = fs.statSync(fp)
      return { name: f, path: fp, size: stat.size, mtime: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
}

// ── Read log file ─────────────────────────────────────────────────────────────
function readLogFile(filePath, lines = 1000) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const all     = content.split('\n').filter(Boolean)
    return all.slice(-lines)
  } catch (_) {
    return []
  }
}

module.exports = {
  init, getLogDir, getLogFilePath,
  log, info, warn, error, critical,
  ctxFromReq, requestLogger,
  listLogFiles, readLogFile, cleanOldLogs,
}
