

const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../../dbus/ipc')

// Channels the renderer is allowed to listen on (main → chrome renderer)
const INBOUND = [
  IPC.TAB_CREATED,
  IPC.TAB_CLOSED,
  IPC.TAB_UPDATED,
  IPC.TAB_SWITCHED,
  IPC.NAV_STATE,
  IPC.FOCUS_OMNIBOX,
  IPC.WIN_MAXIMIZED,
]

contextBridge.exposeInMainWorld('litzium', {
  minimizeWindow: () => ipcRenderer.send(IPC.WIN_MINIMIZE),
  maximizeWindow: () => ipcRenderer.send(IPC.WIN_MAXIMIZE),
  closeWindow:    () => ipcRenderer.send(IPC.WIN_CLOSE),

  newTab:    (url)   => ipcRenderer.send(IPC.TAB_NEW,    url),
  closeTab:  (tabId) => ipcRenderer.send(IPC.TAB_CLOSE,  tabId),
  switchTab: (tabId) => ipcRenderer.send(IPC.TAB_SWITCH, tabId),

  navigate:    (url) => ipcRenderer.send(IPC.NAV_GO,      url),
  goBack:      ()    => ipcRenderer.send(IPC.NAV_BACK),
  goForward:   ()    => ipcRenderer.send(IPC.NAV_FORWARD),
  reload:      ()    => ipcRenderer.send(IPC.NAV_RELOAD),
  stopLoading: ()    => ipcRenderer.send(IPC.NAV_STOP),
  goHome:      ()    => ipcRenderer.send(IPC.NAV_HOME),
  openDevTools: ()   => ipcRenderer.send(IPC.DEVTOOLS_OPEN),

  // ── Autocomplete ──────────────────────────────────────────────────────
  /**
   * Fetch search suggestions from the main process (no CORS).
   * @param {string} query
   * @param {'google'|'ddg'|'bing'} [provider]
   * @returns {Promise<{ suggestions: string[], latencyMs: number }>}
   */
  getSuggestions: (query, provider = 'google') =>
    ipcRenderer.invoke(IPC.SUGGESTIONS_GET, { query, provider }),

  /** Push the WebContentsView down by extraHeight px to reveal the dropdown. */
  expandOmnibox:   (height) => ipcRenderer.send(IPC.OMNIBOX_EXPAND,   { height }),
  /** Restore the WebContentsView to its default y position. */
  collapseOmnibox: ()       => ipcRenderer.send(IPC.OMNIBOX_COLLAPSE),

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

  /** Subscribe once. */
  once(channel, cb) {
    if (!INBOUND.includes(channel)) return
    ipcRenderer.once(channel, (_, data) => cb(data))
  },

  /** Expose channel name constants to the renderer (read-only). */
  channels: Object.freeze({ ...IPC }),
})
