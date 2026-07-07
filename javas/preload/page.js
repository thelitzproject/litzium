/**
 * javas/preload/page.js
 * Minimal preload for trusted internal litzium:// pages that need IPC access.
 * Exposes window.litzPagesAPI — intentionally limited surface.
 *
 * Applied to: newtab, history, bookmarks, downloads, settings, predictions
 */

const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../../dbus/ipc')

// Apply browser theme to this internal page as early as possible
ipcRenderer.invoke(IPC.SETTINGS_GET_ALL).then(s => {
  const theme = s?.browserTheme ?? 'dark'
  document.documentElement.setAttribute('data-theme', theme)
}).catch(() => {})

// Channels internal pages are allowed to receive from main
const PAGE_INBOUND = [
  IPC.DOWNLOAD_STARTED,
  IPC.DOWNLOAD_UPDATED,
  IPC.DOWNLOAD_DONE,
  IPC.NETWORK_REQUEST,
]

contextBridge.exposeInMainWorld('litzPagesAPI', {

  // ── Suggestions ────────────────────────────────────────────────────
  getSuggestions: (query, provider = 'google') =>
    ipcRenderer.invoke(IPC.SUGGESTIONS_GET, { query, provider }),
  providers:     Object.freeze(['google', 'ddg', 'bing']),
  providerNames: Object.freeze({ google: 'Google', ddg: 'DuckDuckGo', bing: 'Bing' }),

  // ── History ────────────────────────────────────────────────────────
  getHistory:    ()     => ipcRenderer.invoke(IPC.HISTORY_GET),
  removeHistory: (id)   => ipcRenderer.invoke(IPC.HISTORY_REMOVE, { id }),
  clearHistory:  ()     => ipcRenderer.send(IPC.HISTORY_CLEAR),

  // ── Bookmarks ──────────────────────────────────────────────────────
  getBookmarks:    ()           => ipcRenderer.invoke(IPC.BOOKMARK_GET_ALL),
  removeBookmark:  (id)         => ipcRenderer.invoke(IPC.BOOKMARK_REMOVE, { id }),

  // ── Downloads ──────────────────────────────────────────────────────
  getDownloads:  ()     => ipcRenderer.invoke(IPC.DOWNLOAD_GET_ALL),
  openDownload:  (id)   => ipcRenderer.send(IPC.DOWNLOAD_OPEN,  { id }),
  showDownload:  (id)   => ipcRenderer.send(IPC.DOWNLOAD_SHOW,  { id }),
  clearDownloads: ()    => ipcRenderer.send(IPC.DOWNLOAD_CLEAR),

  // ── Settings ───────────────────────────────────────────────────────
  getSettings:  ()            => ipcRenderer.invoke(IPC.SETTINGS_GET_ALL),
  setSetting:   (key, value)  => ipcRenderer.send(IPC.SETTINGS_SET, { key, value }),

  // ── Browsing data / download location ──────────────────────────────
  clearBrowsingData:      () => ipcRenderer.invoke(IPC.CLEAR_BROWSING_DATA),
  chooseDownloadLocation: () => ipcRenderer.invoke(IPC.DOWNLOAD_LOCATION_CHOOSE),

  // ── Navigation (used by print-preview cancel button) ──────────────
  navigate: (url) => ipcRenderer.send(IPC.NAV_GO, url),

  // ── Print Preview ─────────────────────────────────────────────────
  generatePrintPreview: (opts) => ipcRenderer.invoke(IPC.PRINT_PREVIEW_GENERATE, opts ?? {}),
  printSourcePage:      (opts) => ipcRenderer.invoke(IPC.PRINT_PREVIEW_PRINT,    opts ?? {}),
  saveSourceAsPDF:      (opts) => ipcRenderer.invoke(IPC.PRINT_PREVIEW_SAVE,     opts ?? {}),

  // ── Password manager ──────────────────────────────────────────────
  getPasswords:    ()          => ipcRenderer.invoke(IPC.PASSWORD_GET_ALL),
  addPassword:     (entry)     => ipcRenderer.invoke(IPC.PASSWORD_ADD,    entry),
  removePassword:  (id)        => ipcRenderer.invoke(IPC.PASSWORD_REMOVE, { id }),
  updatePassword:  (id, patch) => ipcRenderer.invoke(IPC.PASSWORD_UPDATE, { id, ...patch }),
  findPasswords:   (domain)    => ipcRenderer.invoke(IPC.PASSWORD_FIND,   { domain }),

  // ── Dev pages ─────────────────────────────────────────────────────
  getPerformanceData: () => ipcRenderer.invoke(IPC.PERFORMANCE_GET),
  getStorageData:     () => ipcRenderer.invoke(IPC.STORAGE_GET),

  // ── IPC subscription ──────────────────────────────────────────────
  on(channel, cb) {
    if (!PAGE_INBOUND.includes(channel)) return () => {}
    const fn = (_, data) => cb(data)
    ipcRenderer.on(channel, fn)
    return () => ipcRenderer.removeListener(channel, fn)
  },

  channels: Object.freeze({ ...IPC }),
})
