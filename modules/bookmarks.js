
const { app } = require('electron')
const path = require('path')
const fs   = require('fs')

const FILE = path.join(app.getPath('userData'), 'bookmarks.json')

/** @typedef {{ id: string, url: string, title: string, favicon: string|null, addedAt: number }} Bookmark */


function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return []
  }
}

function save(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8')
}


/** Return all bookmarks. */
function getAll() {
  return load()
}

/**
 * Add a bookmark.
 * @param {{ url: string, title?: string, favicon?: string }} opts
 * @returns {Bookmark}
 */
function add({ url, title = url, favicon = null }) {
  const list = load()
  const existing = list.find(b => b.url === url)
  if (existing) return existing   // idempotent

  const bookmark = { id: `bm-${Date.now()}`, url, title, favicon, addedAt: Date.now() }
  list.push(bookmark)
  save(list)
  return bookmark
}

/**
 * Remove a bookmark by id or url.
 * @param {string} idOrUrl
 */
function remove(idOrUrl) {
  const list = load().filter(b => b.id !== idOrUrl && b.url !== idOrUrl)
  save(list)
}

/**
 * Check whether a URL is bookmarked.
 * @param {string} url
 * @returns {boolean}
 */
function has(url) {
  return load().some(b => b.url === url)
}

/**
 * Update an existing bookmark.
 * @param {string} id
 * @param {Partial<Bookmark>} patch
 */
function update(id, patch) {
  const list = load().map(b => b.id === id ? { ...b, ...patch } : b)
  save(list)
}

module.exports = { getAll, add, remove, has, update }
