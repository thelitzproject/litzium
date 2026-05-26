
const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../../dbus/ipc')

// Channels the main process is allowed to push to the chrome renderer
const INBOUND = [
  IPC.TAB_CREATED,
  IPC.TAB_CLOSED,
  IPC.TAB_UPDATED,
  IPC.TAB_SWITCHED,
  IPC.NAV_STATE,
  IPC.FOCUS_OMNIBOX,
  IPC.WIN_MAXIMIZED,
  IPC.BOOKMARK_STATE,
  IPC.DOWNLOAD_STARTED,
  IPC.DOWNLOAD_UPDATED,
  IPC.DOWNLOAD_DONE,
  IPC.FIND_RESULT,
  IPC.FIND_BAR_OPEN,
  IPC.FIND_BAR_CLOSE,
  IPC.ZOOM_CHANGED,
]

contextBridge.exposeInMainWorld('litzium', {
  // ── Window controls ──────────────────────────────────────────────────
  minimizeWindow: () => ipcRenderer.send(IPC.WIN_MINIMIZE),
  maximizeWindow: () => ipcRenderer.send(IPC.WIN_MAXIMIZE),
  closeWindow:    () => ipcRenderer.send(IPC.WIN_CLOSE),

  // ── Tabs ─────────────────────────────────────────────────────────────
  newTab:    (url)   => ipcRenderer.send(IPC.TAB_NEW,    url),
  closeTab:  (tabId) => ipcRenderer.send(IPC.TAB_CLOSE,  tabId),
  switchTab: (tabId) => ipcRenderer.send(IPC.TAB_SWITCH, tabId),

  // ── Navigation ───────────────────────────────────────────────────────
  navigate:    (url) => ipcRenderer.send(IPC.NAV_GO,      url),
  goBack:      ()    => ipcRenderer.send(IPC.NAV_BACK),
  goForward:   ()    => ipcRenderer.send(IPC.NAV_FORWARD),
  reload:      ()    => ipcRenderer.send(IPC.NAV_RELOAD),
  stopLoading: ()    => ipcRenderer.send(IPC.NAV_STOP),
  goHome:      ()    => ipcRenderer.send(IPC.NAV_HOME),
  openDevTools: ()   => ipcRenderer.send(IPC.DEVTOOLS_OPEN),

  // ── Autocomplete ─────────────────────────────────────────────────────
  getSuggestions: (query, provider = 'google') =>
    ipcRenderer.invoke(IPC.SUGGESTIONS_GET, { query, provider }),
  expandOmnibox:   (height) => ipcRenderer.send(IPC.OMNIBOX_EXPAND,   { height }),
  collapseOmnibox: ()       => ipcRenderer.send(IPC.OMNIBOX_COLLAPSE),

  // ── Bookmarks ────────────────────────────────────────────────────────
  /** Toggle bookmark for the current URL. Returns { isBookmarked, bookmark? } */
  toggleBookmark: (url, title, favicon) =>
    ipcRenderer.invoke(IPC.BOOKMARK_TOGGLE, { url, title, favicon }),
  /** Check if a URL is bookmarked. Returns boolean. */
  isBookmarked: (url) =>
    ipcRenderer.invoke(IPC.BOOKMARK_IS, { url }),

  // ── Find in page ─────────────────────────────────────────────────────
  findStart: (text, forward = true) => ipcRenderer.send(IPC.FIND_START, { text, forward }),
  findStop:  ()                     => ipcRenderer.send(IPC.FIND_STOP),
  openFindBar:  () => ipcRenderer.send(IPC.FIND_BAR_OPEN),
  closeFindBar: () => ipcRenderer.send(IPC.FIND_BAR_CLOSE),

  // ── Zoom ─────────────────────────────────────────────────────────────
  resetZoom: () => ipcRenderer.send(IPC.ZOOM_RESET),

  // ── IPC event subscription ───────────────────────────────────────────
  /**
   * Subscribe to a main-process event.
   * @param {string} channel
   * @param {(data: any) => void} cb
   * @returns {() => void} unsubscribe
   */
  on(channel, cb) {
    if (!INBOUND.includes(channel)) return () => {}
    const fn = (_, data) => cb(data)
    ipcRenderer.on(channel, fn)
    return () => ipcRenderer.removeListener(channel, fn)
  },

  once(channel, cb) {
    if (!INBOUND.includes(channel)) return
    ipcRenderer.once(channel, (_, data) => cb(data))
  },

  /** Frozen copy of all IPC channel name constants. */
  channels: Object.freeze({ ...IPC }),
})
