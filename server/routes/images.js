'use strict'

const express  = require('express')
const https    = require('https')
const path     = require('path')
const fs       = require('fs')
const multer   = require('multer')
const { randomUUID } = require('crypto')
const { jwtAuth }    = require('../middleware/jwtAuth')

module.exports = function imagesRouter () {
  const router = express.Router()
  router.use(jwtAuth)

  // ── File upload ───────────────────────────────────────────────────
  const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'menu-images')
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename:    (_req, file, cb) => {
      // extname returns '.png'; strip the leading dot, default to jpg
      const ext = (path.extname(file.originalname).toLowerCase().slice(1) || 'jpg').replace(/[^a-z0-9]/g, '')
      cb(null, randomUUID().replace(/-/g, '') + '.' + ext)
    }
  })
  const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true)
      else cb(new Error('Only image files are allowed'))
    }
  })

  // POST /images/upload
  router.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/menu-images/${req.file.filename}`
    res.json({ ok: true, url: publicUrl })
  })

  // ── Openverse image search proxy (Creative Commons, no API key) ───
  function httpsGet (url) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept:       'application/json'
        }
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
          return httpsGet(res.headers.location).then(resolve).catch(reject)
        let body = ''
        res.on('data', c => { body += c })
        res.on('end', () => resolve({ status: res.statusCode, body }))
      })
      req.on('error', reject)
      req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')) })
    })
  }

  // GET /images/search?q=grilled+chicken
  router.get('/search', async (req, res) => {
    const q = (req.query.q || '').trim()
    if (!q) return res.status(400).json({ error: 'q is required' })

    try {
      const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20`
      const r = await httpsGet(url)
      if (r.status !== 200) return res.status(503).json({ error: 'Search service returned ' + r.status })
      const data = JSON.parse(r.body)
      const results = (data.results || []).map(img => ({
        thumb: img.thumbnail,
        url:   img.url,
        title: img.title || ''
      }))
      res.json({ ok: true, results })
    } catch (e) {
      res.status(503).json({ error: 'Image search unavailable: ' + e.message })
    }
  })

  return router
}
