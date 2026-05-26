/**
 * javas/preload/page.js
 * Minimal preload for trusted internal litzium:// pages that need IPC access.
 *
 * Exposed as window.litzPagesAPI — intentionally limited surface:
 *  · getSuggestions(query, provider) — fetch search autocomplete
 *  · providers                       — list of valid provider IDs
 *
 * This preload is only injected into pages listed in INTERNAL_PAGES with
 * a `preload` entry. External sites never receive it.
 */

const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../../dbus/ipc')

contextBridge.exposeInMainWorld('litzPagesAPI', {
  /**
   * Fetch search suggestions for the given query.
   *
   * @param {string}                    query
   * @param {'google'|'ddg'|'bing'}     [provider='google']
   * @returns {Promise<{ suggestions: string[], latencyMs: number }>}
   */
  getSuggestions: (query, provider = 'google') =>
    ipcRenderer.invoke(IPC.SUGGESTIONS_GET, { query, provider }),

  /** Ordered list of supported provider IDs. */
  providers: Object.freeze(['google', 'ddg', 'bing']),

  /** Pretty names for each provider. */
  providerNames: Object.freeze({
    google: 'Google',
    ddg:    'DuckDuckGo',
    bing:   'Bing',
  }),
})
