/**
 * javas/preload/page.js
 * Minimal preload for trusted internal litzium:// pages that need IPC access.
 * Exposes window.litzPagesAPI — intentionally limited surface.
 *
 * Applied to: newtab, history, bookmarks, downloads, settings, predictions
 */

const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../../dbus/ipc')

// Channels internal pages are allowed to receive from main
const PAGE_INBOUND = [
  IPC.DOWNLOAD_STARTED,
  IPC.DOWNLOAD_UPDATED,
  IPC.DOWNLOAD_DONE,
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

  // ── Navigation (used by print-preview cancel button) ──────────────
  navigate: (url) => ipcRenderer.send(IPC.NAV_GO, url),

  // ── Print Preview ─────────────────────────────────────────────────
  /** Generate a PDF preview of the source page. Returns { success, data: base64, error? } */
  generatePrintPreview: (opts) => ipcRenderer.invoke(IPC.PRINT_PREVIEW_GENERATE, opts ?? {}),
  /** Print the source page via the OS print dialog. Returns { success, failureReason? } */
  printSourcePage:      (opts) => ipcRenderer.invoke(IPC.PRINT_PREVIEW_PRINT,    opts ?? {}),
  /** Save the source page as a PDF (shows save dialog). Returns { saved, filePath?, error? } */
  saveSourceAsPDF:      (opts) => ipcRenderer.invoke(IPC.PRINT_PREVIEW_SAVE,     opts ?? {}),

  // ── IPC subscription (for live download updates) ───────────────────
  on(channel, cb) {
    if (!PAGE_INBOUND.includes(channel)) return () => {}
    const fn = (_, data) => cb(data)
    ipcRenderer.on(channel, fn)
    return () => ipcRenderer.removeListener(channel, fn)
  },

  channels: Object.freeze({ ...IPC }),
})
