const { app, BrowserWindow, ipcMain, session, nativeTheme } = require('electron')
const path = require('path')
const IPC = require('../../dbus/ipc')
const { createTabManager } = require('./tab-manager')
const { fetchSuggestions } = require('./suggestions')
const history   = require('../../modules/history')
const bookmarks = require('../../modules/bookmarks')
const downloads = require('../../modules/downloads')
const settings  = require('../../modules/settings')
const printer   = require('../../printing/print')
const CHROME_HEIGHT = 88

/** @type {Map<BrowserWindow, ReturnType<typeof createTabManager>>} */
const windowManagers = new Map()

/** Route an IPC event to the tab manager for the sender's window. */
function getManager(event) {
  const bw = BrowserWindow.fromWebContents(event.sender)
  return bw ? windowManagers.get(bw) : null
}

/** Return the effective theme string to send to the renderer. */
function resolveTheme(setting) {
  return (setting === 'dark' || setting === 'light' || setting === 'system') ? setting : 'dark'
}

function broadcastTheme(theme) {
  for (const [bw] of windowManagers) {
    if (!bw.isDestroyed()) bw.webContents.send(IPC.THEME_APPLY, theme)
  }
}


function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    frame: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const tabs = createTabManager(win, CHROME_HEIGHT)
  windowManagers.set(win, tabs)

  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, '../../pages/browser.html'))

  win.once('ready-to-show', () => {
    win.show()
    tabs.init()

    const pending = tabs.loadSession()
    if (pending && pending.tabs.length > 0) {
      tabs.createTab('litzium://newtab')
      win.webContents.send(IPC.SESSION_AVAILABLE, { count: pending.tabs.length })
    } else {
      tabs.createTab('litzium://newtab')
    }

    win.webContents.send(IPC.THEME_APPLY, resolveTheme(settings.get('browserTheme')))
    downloads.setup(session.defaultSession, win, IPC)
  })

  win.on('resize',     () => tabs.updateAllBounds())
  win.on('maximize',   () => { win.webContents.send(IPC.WIN_MAXIMIZED, true);  tabs.updateAllBounds() })
  win.on('unmaximize', () => { win.webContents.send(IPC.WIN_MAXIMIZED, false); tabs.updateAllBounds() })

  win.on('closed', () => {
    windowManagers.delete(win)
  })
}

// ─── IPC setup (registered once; routed per-window via event.sender) ──────────

function setupIPC() {

  // ── Window controls ────────────────────────────────────────────────────────
  ipcMain.on(IPC.WIN_NEW,      ()      => createWindow())
  ipcMain.on(IPC.WIN_MINIMIZE, event   => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.on(IPC.WIN_MAXIMIZE, event   => {
    const w = BrowserWindow.fromWebContents(event.sender)
    w?.isMaximized() ? w.unmaximize() : w?.maximize()
  })
  ipcMain.on(IPC.WIN_CLOSE,    event   => BrowserWindow.fromWebContents(event.sender)?.close())

  // ── Tabs ───────────────────────────────────────────────────────────────────
  ipcMain.on(IPC.TAB_NEW,    (event, url)   => getManager(event)?.createTab(url))
  ipcMain.on(IPC.TAB_CLOSE,  (event, tabId) => getManager(event)?.closeTab(tabId))
  ipcMain.on(IPC.TAB_SWITCH, (event, tabId) => getManager(event)?.switchTab(tabId))

  // ── Navigation ─────────────────────────────────────────────────────────────
  ipcMain.on(IPC.NAV_GO,      (event, url) => getManager(event)?.navigate(url))
  ipcMain.on(IPC.NAV_BACK,    event        => getManager(event)?.goBack())
  ipcMain.on(IPC.NAV_FORWARD, event        => getManager(event)?.goForward())
  ipcMain.on(IPC.NAV_RELOAD,  event        => getManager(event)?.reload())
  ipcMain.on(IPC.NAV_STOP,    event        => getManager(event)?.stop())
  ipcMain.on(IPC.NAV_HOME,    event        => getManager(event)?.navigate('litzium://newtab'))
  ipcMain.on(IPC.DEVTOOLS_OPEN, event      => getManager(event)?.openDevTools())

  // ── Autocomplete ───────────────────────────────────────────────────────────
  ipcMain.handle(IPC.SUGGESTIONS_GET, async (_, { query, provider } = {}) => {
    const p = provider ?? settings.get('suggestionsProvider') ?? 'google'
    return fetchSuggestions(query, p)
  })
  ipcMain.on(IPC.OMNIBOX_EXPAND,   (event, { height } = {}) => getManager(event)?.setOmniboxOpen(true,  height ?? 0))
  ipcMain.on(IPC.OMNIBOX_COLLAPSE, event                    => getManager(event)?.setOmniboxOpen(false, 0))

  // ── History ────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.HISTORY_GET,    ()          => history.getAll())
  ipcMain.handle(IPC.HISTORY_REMOVE, (_, { id }) => { history.remove(id); return true })
  ipcMain.on(IPC.HISTORY_CLEAR,      ()          => history.clear())

  // ── Bookmarks ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.BOOKMARK_GET_ALL, () => bookmarks.getAll())
  ipcMain.handle(IPC.BOOKMARK_IS,      (_, { url }) => bookmarks.has(url))
  ipcMain.handle(IPC.BOOKMARK_REMOVE,  (_, { id })  => { bookmarks.remove(id); return true })
  ipcMain.handle(IPC.BOOKMARK_TOGGLE,  (event, { url, title, favicon }) => {
    const bw = BrowserWindow.fromWebContents(event.sender)
    if (bookmarks.has(url)) {
      bookmarks.remove(url)
      bw?.webContents.send(IPC.BOOKMARK_STATE, { url, isBookmarked: false })
      return { isBookmarked: false }
    } else {
      const bm = bookmarks.add({ url, title, favicon })
      bw?.webContents.send(IPC.BOOKMARK_STATE, { url, isBookmarked: true })
      return { isBookmarked: true, bookmark: bm }
    }
  })

  // ── Downloads ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.DOWNLOAD_GET_ALL, () => downloads.getAll())
  ipcMain.on(IPC.DOWNLOAD_OPEN,        (_, { id }) => downloads.openFile(id))
  ipcMain.on(IPC.DOWNLOAD_SHOW,        (_, { id }) => downloads.showInFolder(id))
  ipcMain.on(IPC.DOWNLOAD_CLEAR,       ()          => downloads.clear())

  // ── Settings ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => settings.getAll())
  ipcMain.on(IPC.SETTINGS_SET, (_, { key, value }) => {
    settings.set(key, value)
    if (key === 'searchEngine') windowManagers.forEach(m => m.setSearchEngine(value))
    if (key === 'browserTheme') broadcastTheme(resolveTheme(value))
  })

  // ── Find in page ───────────────────────────────────────────────────────────
  ipcMain.on(IPC.FIND_START,     (event, { text, forward = true } = {}) => getManager(event)?.findInPage(text, forward))
  ipcMain.on(IPC.FIND_STOP,      event => getManager(event)?.stopFindInPage())
  ipcMain.on(IPC.FIND_BAR_OPEN,  event => getManager(event)?.setFindBarOpen(true))
  ipcMain.on(IPC.FIND_BAR_CLOSE, event => getManager(event)?.setFindBarOpen(false))

  // ── Zoom ───────────────────────────────────────────────────────────────────
  ipcMain.on(IPC.ZOOM_RESET, event => getManager(event)?.resetZoom())

  // ── Pinned tabs ────────────────────────────────────────────────────────────
  ipcMain.on(IPC.TAB_PIN,   (event, { tabId }) => getManager(event)?.pinTab(tabId))
  ipcMain.on(IPC.TAB_UNPIN, (event, { tabId }) => getManager(event)?.unpinTab(tabId))

  // ── Reopen last closed tab ─────────────────────────────────────────────────
  ipcMain.on(IPC.TAB_REOPEN_LAST, event => getManager(event)?.reopenLastClosed())

  // ── Session ────────────────────────────────────────────────────────────────
  ipcMain.on(IPC.SESSION_RESTORE, event => getManager(event)?.restoreSession())
  ipcMain.on(IPC.SESSION_DISMISS, event => getManager(event)?.clearSession())

  // ── Download shelf ─────────────────────────────────────────────────────────
  ipcMain.on(IPC.SHELF_OPEN,  (event, { height } = {}) => getManager(event)?.setShelfOpen(true,  height ?? 52))
  ipcMain.on(IPC.SHELF_CLOSE, event                    => getManager(event)?.setShelfOpen(false, 0))

  // ── Sidebar ────────────────────────────────────────────────────────────────
  ipcMain.on(IPC.SIDEBAR_OPEN,  event => getManager(event)?.setSidebarOpen(true))
  ipcMain.on(IPC.SIDEBAR_CLOSE, event => getManager(event)?.setSidebarOpen(false))

  // ── Print ───────────────────────────────────────────────────────────────────
  ipcMain.on(IPC.PRINT, async event => {
    const wc = getManager(event)?.getActiveWebContents()
    if (!wc) return
    const bw = BrowserWindow.fromWebContents(event.sender)
    const result = await printer.printPage(wc)
    bw?.webContents.send(IPC.PRINT_RESULT, result)
  })

  ipcMain.on(IPC.PRINT_TO_PDF, async event => {
    const manager = getManager(event)
    const wc = manager?.getActiveWebContents()
    const bw = BrowserWindow.fromWebContents(event.sender)
    if (!wc || !bw) return
    const result = await printer.savePDF(wc, bw)
    bw.webContents.send(IPC.PRINT_RESULT, result)
  })

  // ── Print Preview ──────────────────────────────────────────────────────────
  ipcMain.on(IPC.PRINT_PREVIEW_OPEN, event => getManager(event)?.openPrintPreview())

  ipcMain.handle(IPC.PRINT_PREVIEW_GENERATE, async (event, opts = {}) => {
    const wc = getManager(event)?.getPrintPreviewTarget()
    if (!wc) return { success: false, error: 'No print target available' }
    return printer.generatePreviewPDF(wc, opts)
  })

  ipcMain.handle(IPC.PRINT_PREVIEW_PRINT, async (event, opts = {}) => {
    const wc = getManager(event)?.getPrintPreviewTarget()
    if (!wc) return { success: false, failureReason: 'No print target available' }
    return printer.printPage(wc, opts)
  })

  ipcMain.handle(IPC.PRINT_PREVIEW_SAVE, async (event, opts = {}) => {
    const wc = getManager(event)?.getPrintPreviewTarget()
    const bw = BrowserWindow.fromWebContents(event.sender)
    if (!wc || !bw) return { saved: false, error: 'No print target available' }
    return printer.savePDF(wc, bw, opts)
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  setupIPC()

  nativeTheme.on('updated', () => {
    if (settings.get('browserTheme') === 'system') broadcastTheme('system')
  })
})

app.on('before-quit', () => {
  windowManagers.forEach(m => m.saveSession())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
