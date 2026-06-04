/**
 * modules/settings.js
 * Persists browser settings to userData/settings.json.
 * In-memory cache means only one file read per session.
 */

const { app } = require('electron')
const path    = require('path')
const fs      = require('fs')

let _file = null
function getFile() {
  if (!_file) _file = path.join(app.getPath('userData'), 'settings.json')
  return _file
}

const DEFAULTS = {
  searchEngine:            'google',   // google | bing | duckduckgo | brave | ecosia
  suggestionsEnabled:      true,
  suggestionsProvider:     'google',   // google | ddg | bing
  saveHistory:             true,
  newtabBackground:        'aurora',
  browserTheme:            'dark',
  openNewTabsInBackground: false,
  confirmCloseTabs:        true,
  askDownloadLocation:     false,
  showTabFavicons:         true,
  blockInsecureContent:    true,
  doNotTrack:              false,
  startupBehavior:         'newtab',   // newtab | restore
  clockFormat:             '24h',      // 24h | 12h
  downloadLocation:        null,       // null = system default
  ntShortcuts:             null,       // null = use built-in defaults
}

let _cache = null

function _load() {
  try   { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(getFile(), 'utf8')) } }
  catch { return { ...DEFAULTS } }
}

function _flush() {
  try { fs.writeFileSync(getFile(), JSON.stringify(_cache, null, 2), 'utf8') }
  catch (e) { console.warn('[settings] write failed:', e.message) }
}

function _ensure() {
  if (!_cache) _cache = _load()
}

/** Return a copy of all settings. */
function getAll() {
  _ensure()
  return { ..._cache }
}

/** Get a single setting value. */
function get(key) {
  _ensure()
  return _cache[key] ?? DEFAULTS[key]
}

/** Set a single setting and persist. */
function set(key, value) {
  _ensure()
  _cache[key] = value
  _flush()
}

/** Set multiple settings at once and persist. */
function setMany(obj) {
  _ensure()
  Object.assign(_cache, obj)
  _flush()
}

module.exports = { getAll, get, set, setMany, DEFAULTS }
