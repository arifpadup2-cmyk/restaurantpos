'use strict'

const crypto = require('crypto')
const bcrypt = require('bcryptjs')

// ── ID generation ─────────────────────────────────────────────────────────────

function generateRestaurantId () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = 'REST-'
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

function generateLicenseKey () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seg = () => { let s = ''; for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s }
  return `${seg()}-${seg()}-${seg()}-${seg()}`
}

function generateMachineId (prefix = 'POS') {
  const n = String(Math.floor(Math.random() * 90) + 10)
  return `${prefix}-${n}`
}

// ── Hashing ───────────────────────────────────────────────────────────────────

async function hashLicenseKey (key) {
  return bcrypt.hash(normalizeKey(key), 10)
}

async function verifyLicenseKey (key, hash) {
  return bcrypt.compare(normalizeKey(key), hash)
}

function normalizeKey (key) {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function keyPrefix (key) {
  return key.split('-')[0] || key.slice(0, 4)
}

// ── Encryption for credentials stored in .env / config ───────────────────────

const ENC_ALG = 'aes-256-cbc'

function getEncKey () {
  const secret = process.env.JWT_SECRET || 'default-pos-secret'
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptText (text) {
  const iv  = crypto.randomBytes(16)
  const key = getEncKey()
  const cipher = crypto.createCipheriv(ENC_ALG, key, iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + enc.toString('hex')
}

function decryptText (payload) {
  const [ivHex, encHex] = payload.split(':')
  const iv  = Buffer.from(ivHex, 'hex')
  const key = getEncKey()
  const decipher = crypto.createDecipheriv(ENC_ALG, key, iv)
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
  return dec.toString('utf8')
}

// ── Expiry check ──────────────────────────────────────────────────────────────

function isExpired (expiresAt) {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

module.exports = {
  generateRestaurantId,
  generateLicenseKey,
  generateMachineId,
  hashLicenseKey,
  verifyLicenseKey,
  normalizeKey,
  keyPrefix,
  encryptText,
  decryptText,
  isExpired,
}
