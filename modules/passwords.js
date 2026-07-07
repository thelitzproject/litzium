
const crypto = require('crypto')
const { app } = require('electron')
const path = require('path')
const fs   = require('fs')

const ALGO    = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN  = 12
const TAG_LEN = 16

let _key   = null
let _file  = null
let _cache = null

function getFile() {
  if (!_file) _file = path.join(app.getPath('userData'), 'passwords.json')
  return _file
}

function getKey() {
  if (_key) return _key
  const keyFile = path.join(app.getPath('userData'), '.pwkey')
  try {
    const buf = fs.readFileSync(keyFile)
    if (buf.length !== KEY_LEN) throw new Error('bad length')
    _key = buf
  } catch {
    _key = crypto.randomBytes(KEY_LEN)
    fs.writeFileSync(keyFile, _key)
  }
  return _key
}

function encrypt(text) {
  const iv     = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')
}

function decrypt(data) {
  const buf     = Buffer.from(data, 'base64')
  const iv      = buf.subarray(0, IV_LEN)
  const tag     = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc     = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

function load() {
  if (_cache) return _cache
  try {
    const raw = JSON.parse(fs.readFileSync(getFile(), 'utf8'))
    _cache = raw.map(e => ({ ...e, password: decrypt(e.password) }))
  } catch {
    _cache = []
  }
  return _cache
}

function save() {
  const encrypted = (_cache || []).map(e => ({ ...e, password: encrypt(e.password) }))
  fs.writeFileSync(getFile(), JSON.stringify(encrypted, null, 2), 'utf8')
}

/** @returns {Array<{id:string, domain:string, username:string, password:string, createdAt:number}>} */
function getAll() { return load().slice() }

function add({ domain, username, password }) {
  load()
  const entry = { id: `pw-${Date.now()}-${Math.random().toString(36).slice(2)}`, domain, username, password, createdAt: Date.now() }
  _cache.push(entry)
  save()
  return entry
}

function remove(id) {
  load()
  _cache = _cache.filter(e => e.id !== id)
  save()
}

function update(id, { username, password, domain } = {}) {
  load()
  const entry = _cache.find(e => e.id === id)
  if (!entry) return false
  if (username !== undefined) entry.username = username
  if (password !== undefined) entry.password = password
  if (domain   !== undefined) entry.domain   = domain
  save()
  return true
}

function findByDomain(domain) {
  return load().filter(e =>
    e.domain === domain ||
    domain.endsWith('.' + e.domain) ||
    e.domain.endsWith('.' + domain)
  )
}

module.exports = { getAll, add, remove, update, findByDomain }
