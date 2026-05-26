
const { app } = require('electron')
const path = require('path')
const fs   = require('fs')

const FILE        = path.join(app.getPath('userData'), 'history.json')
const MAX_ENTRIES = 5000

/** @typedef {{ id: string, url: string, title: string, favicon: string|null, visitedAt: number }} HistoryEntry */


function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return []
  }
}

function save(list) {
  // Keep the most recent MAX_ENTRIES entries
  const trimmed = list.slice(-MAX_ENTRIES)
  fs.writeFileSync(FILE, JSON.stringify(trimmed, null, 2), 'utf8')
}


/** Return history (newest first). */
function getAll() {
  return load().reverse()
}

/**
 * Record a page visit.
 * @param {{ url: string, title?: string, favicon?: string }} opts
 */
function push({ url, title = url, favicon = null }) {
  // Skip internal pages
  if (!url || url.startsWith('litzium://') || url.startsWith('file://')) return

  const list = load()
  list.push({ id: `h-${Date.now()}`, url, title, favicon, visitedAt: Date.now() })
  save(list)
}

/**
 * Search history by query string (matches url or title).
 * @param {string} query
 * @param {number} [limit=50]
 * @returns {HistoryEntry[]}
 */
function search(query, limit = 50) {
  const q = query.toLowerCase()
  return load()
    .filter(e => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
    .slice(-limit)
    .reverse()
}

/** Delete a specific entry by id. */
function remove(id) {
  save(load().filter(e => e.id !== id))
}

/** Wipe all history. */
function clear() {
  save([])
}

module.exports = { getAll, push, search, remove, clear }
