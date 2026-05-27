'use strict'

const express  = require('express')
const https    = require('https')
const http     = require('http')
const path     = require('path')
const fs       = require('fs')
const multer   = require('multer')
const { randomUUID } = require('crypto')
const { jwtAuth }    = require('../middleware/jwtAuth')

module.exports = function imagesRouter () {
  const router = express.Router()
  router.use(jwtAuth)

  // ── File upload setup ─────────────────────────────────────────────
  const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'menu-images')
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename:    (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || 'jpg'
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

  // POST /api/images/upload
  router.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/menu-images/${req.file.filename}`
    res.json({ ok: true, url: publicUrl })
  })

  // ── DuckDuckGo image search proxy ─────────────────────────────────
  function httpGet (url, headers = {}) {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http
      const req = mod.get(url, {
        headers: {
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...headers
        }
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return httpGet(res.headers.location, headers).then(resolve).catch(reject)
        }
        let body = ''
        res.on('data', c => { body += c })
        res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }))
      })
      req.on('error', reject)
      req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')) })
    })
  }

  // GET /api/images/search?q=grilled+chicken
  router.get('/search', async (req, res) => {
    const q = (req.query.q || '').trim()
    if (!q) return res.status(400).json({ error: 'q is required' })

    try {
      // Step 1 — get VQD token from DuckDuckGo
      const init = await httpGet(
        `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
        { Cookie: 'p=-2' }
      )
      const m = init.body.match(/vqd=["']?([^"'&\s]+)/)
                || init.body.match(/data-vqd="([^"]+)"/)
      if (!m) return res.status(503).json({ error: 'Search temporarily unavailable' })
      const vqd = m[1]

      // Step 2 — fetch image results
      const imgsRes = await httpGet(
        `https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`,
        {
          Referer: 'https://duckduckgo.com/',
          Accept:  'application/json, text/javascript, */*; q=0.01',
          Cookie:  'p=-2'
        }
      )
      const data = JSON.parse(imgsRes.body)
      const results = (data.results || []).slice(0, 24).map(r => ({
        thumb: r.thumbnail,
        url:   r.image,
        title: r.title || ''
      }))
      res.json({ ok: true, results })
    } catch (e) {
      res.status(503).json({ error: 'Image search unavailable: ' + e.message })
    }
  })

  return router
}
