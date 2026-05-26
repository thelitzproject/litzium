/**
 * javas/main/suggestions.js
 * Fetches search suggestions from external APIs using Electron's net.fetch
 * (no CORS restrictions in the main process).
 *
 * All three providers return the OpenSearch Suggestion Format:
 *   [ "query", [ "suggestion1", "suggestion2", ... ] ]
 */

const { net } = require('electron')

// ─── Provider URL builders ────────────────────────────────────────────────────

const PROVIDERS = {
  google: q =>
    `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`,
  ddg: q =>
    `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`,
  bing: q =>
    `https://api.bing.com/osjson.aspx?Query=${encodeURIComponent(q)}`,
}

const PROVIDER_IDS = Object.keys(PROVIDERS)

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch up to `limit` search suggestions for `query`.
 *
 * @param {string}                      query
 * @param {'google'|'ddg'|'bing'}       [provider='google']
 * @param {number}                      [limit=8]
 * @returns {Promise<{ suggestions: string[], latencyMs: number }>}
 */
async function fetchSuggestions(query, provider = 'google', limit = 8) {
  const q = (query ?? '').trim()
  if (!q) return { suggestions: [], latencyMs: 0 }

  const buildUrl = PROVIDERS[provider] ?? PROVIDERS.google
  const url      = buildUrl(q)
  const t0       = Date.now()

  try {
    const res = await net.fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Litzium/1.0)' },
    })

    const latencyMs = Date.now() - t0

    if (!res.ok) return { suggestions: [], latencyMs }

    const json = await res.json()

    // Standard OpenSearch format: [query, [sug1, sug2, ...], ...]
    if (Array.isArray(json) && Array.isArray(json[1])) {
      const suggestions = json[1]
        .filter(s => typeof s === 'string')
        .slice(0, limit)
      return { suggestions, latencyMs }
    }

    return { suggestions: [], latencyMs }
  } catch (err) {
    console.warn('[suggestions] fetch error:', err.message)
    return { suggestions: [], latencyMs: Date.now() - t0 }
  }
}

module.exports = { fetchSuggestions, PROVIDERS, PROVIDER_IDS }
