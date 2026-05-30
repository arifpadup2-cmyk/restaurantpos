'use strict';

/**
 * POS Activity & Error Logger
 * Writes structured JSON-line logs to daily rotating files.
 * File name: OUTLETCODE_TERMINAL_YYYY-MM-DD.log
 * Retention: 30 days (auto-cleaned on startup)
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Sensitive field masking ───────────────────────────────────────────────────
const MASK_KEYS = new Set([
  'pin','password','pass','db_pass','dbpass','token','secret',
  'api_key','apikey','license_key','licensekey','authorization',
  'card_number','cvv','access_token','refresh_token'
]);

function maskValue(key, value) {
  if (MASK_KEYS.has(String(key).toLowerCase())) return '****';
  return value;
}

function maskObject(obj, depth = 0) {
  if (depth > 4 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => maskObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = maskValue(k, typeof v === 'object' ? maskObject(v, depth + 1) : v);
  }
  return out;
}

// ── Logger state ──────────────────────────────────────────────────────────────
let _logDir    = null;
let _context   = {};   // brand_id, outlet_id, outlet_code, outlet_name, terminal, etc.
let _appVersion = '2.1.0';

function init(userDataPath, context = {}, version = '2.1.0') {
  _logDir     = path.join(userDataPath, 'logs');
  _context    = context;
  _appVersion = version;
  if (!fs.existsSync(_logDir)) fs.mkdirSync(_logDir, { recursive: true });
  cleanOldLogs();
}

function setContext(ctx) {
  _context = { ..._context, ...ctx };
  // Expose for log-uploader
  module.exports._context = _context;
}

// Expose version for uploader
function getVersion() { return _appVersion; }

// ── File name ─────────────────────────────────────────────────────────────────
function safeStr(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'UNKNOWN';
}

function getLogFilePath() {
  if (!_logDir) return null;
  const date     = new Date().toISOString().slice(0, 10);
  const outlet   = safeStr(_context.outlet_code   || 'NOOUTLET');
  const name     = safeStr(_context.outlet_name   || 'NONAME');
  const terminal = safeStr(_context.terminal_name || 'NOTERMINAL');
  return path.join(_logDir, `${outlet}_${name}_${terminal}_${date}.log`);
}

function getLogDir() { return _logDir; }

// ── Write ─────────────────────────────────────────────────────────────────────
function write(level, module_name, screen, action, extra = {}) {
  if (!_logDir) return;
  const filePath = getLogFilePath();
  if (!filePath) return;

  const entry = {
    timestamp:     new Date().toISOString(),
    level:         level.toUpperCase(),
    version:       _appVersion,
    module:        module_name  || 'POS',
    screen:        screen       || '',
    action,
    // User context (filled when known)
    user_id:       _context.user_id       || '',
    user_name:     _context.user_name     || '',
    user_role:     _context.user_role     || '',
    // Brand/outlet context
    brand_id:      _context.brand_id      || '',
    brand_name:    _context.brand_name    || '',
    outlet_id:     _context.outlet_id     || '',
    outlet_code:   _context.outlet_code   || '',
    outlet_name:   _context.outlet_name   || '',
    terminal_name: _context.terminal_name || '',
    device_ip:     _context.device_ip     || '',
    // Extra data (masked)
    ...maskObject(extra),
  };

  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (_) {}
}

// ── Public log functions ──────────────────────────────────────────────────────
const info     = (module, screen, action, extra) => write('INFO',     module, screen, action, extra);
const warn     = (module, screen, action, extra) => write('WARNING',  module, screen, action, extra);
const error    = (module, screen, action, extra) => write('ERROR',    module, screen, action, extra);
const critical = (module, screen, action, extra) => write('CRITICAL', module, screen, action, extra);

// Generic log(level, module, screen, action, extra)
function log(level, module_name, screen, action, extra) {
  write(level, module_name, screen, action, extra);
}

// ── Cleanup old logs (>30 days) ───────────────────────────────────────────────
function cleanOldLogs() {
  if (!_logDir) return;
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const files  = fs.readdirSync(_logDir).filter(f => f.endsWith('.log'));
    for (const f of files) {
      const fp   = path.join(_logDir, f);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(fp);
      }
    }
  } catch (_) {}
}

// ── List log files ────────────────────────────────────────────────────────────
function listLogFiles() {
  if (!_logDir || !fs.existsSync(_logDir)) return [];
  return fs.readdirSync(_logDir)
    .filter(f => f.endsWith('.log'))
    .map(f => {
      const fp   = path.join(_logDir, f);
      const stat = fs.statSync(fp);
      return { name: f, path: fp, size: stat.size, mtime: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

// ── Read log file content (last N lines) ──────────────────────────────────────
function readLogFile(filePath, lines = 500) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const all     = content.split('\n').filter(Boolean);
    return all.slice(-lines).join('\n');
  } catch (e) {
    return '';
  }
}

module.exports = { init, setContext, getLogDir, getLogFilePath, getVersion, log, info, warn, error, critical, listLogFiles, readLogFile, cleanOldLogs, _context };
