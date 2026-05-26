

/** @typedef {{ id: string, name: string, keyword: string, url: string }} SearchEngine */

const ENGINES = [
  { id: 'google',     name: 'Google',     keyword: 'g',  url: 'https://www.google.com/search?q=%s' },
  { id: 'bing',       name: 'Bing',       keyword: 'b',  url: 'https://www.bing.com/search?q=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', keyword: 'dd', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'brave',      name: 'Brave',      keyword: 'br', url: 'https://search.brave.com/search?q=%s' },
  { id: 'ecosia',     name: 'Ecosia',     keyword: 'e',  url: 'https://www.ecosia.org/search?q=%s' },
]

let defaultEngineId = 'google'

function getAll()     { return ENGINES }
function getDefault() { return ENGINES.find(e => e.id === defaultEngineId) ?? ENGINES[0] }
function setDefault(id) {
  if (ENGINES.find(e => e.id === id)) defaultEngineId = id
}

/**
 * Build a search URL for the given query string.
 * @param {string} query
 * @param {string} [engineId]
 */
function buildURL(query, engineId) {
  const engine = (engineId ? ENGINES.find(e => e.id === engineId) : null) ?? getDefault()
  return engine.url.replace('%s', encodeURIComponent(query))
}

module.exports = { getAll, getDefault, setDefault, buildURL }
