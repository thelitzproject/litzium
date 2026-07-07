const { app, BrowserWindow, ipcMain, session, nativeTheme, dialog } = require('electron')
const path = require('path')
const IPC = require('../../dbus/ipc')
const { createTabManager } = require('./tab-manager')
const { fetchSuggestions } = require('./suggestions')
const history   = require('../../modules/history')
const bookmarks = require('../../modules/bookmarks')
const downloads = require('../../modules/downloads')
const settings  = require('../../modules/settings')
const passwords = require('../../modules/passwords')
const printer   = require('../../printing/print')
const CHROME_HEIGHT = 88
const isMac = process.platform === 'darwin'

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

function broadcastAccent(color) {
  for (const [bw] of windowManagers) {
    if (!bw.isDestroyed()) bw.webContents.send(IPC.ACCENT_APPLY, { color })
  }
}


function createWindow() {
  const winOptions = {
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  }

  if (isMac) {
    winOptions.titleBarStyle = 'hiddenInset'
    winOptions.trafficLightPosition = { x: 12, y: 14 }
  } else {
    winOptions.frame = false
  }

  const win = new BrowserWindow(winOptions)

  const tabs = createTabManager(win, CHROME_HEIGHT)
  windowManagers.set(win, tabs)

  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, '../../pages/browser.html'))

  win.once('ready-to-show', () => {
    win.show()
    tabs.init()

    const pending = tabs.loadSession()
    if (pending && pending.tabs.length > 0 && settings.get('startupBehavior') === 'restore') {
      tabs.restoreSession()
    } else if (pending && pending.tabs.length > 0) {
      tabs.createTab('litzium://newtab')
      win.webContents.send(IPC.SESSION_AVAILABLE, { count: pending.tabs.length })
    } else {
      tabs.createTab('litzium://newtab')
    }

    win.webContents.send(IPC.THEME_APPLY, resolveTheme(settings.get('browserTheme')))
    const accent = settings.get('accentColor')
    if (accent) win.webContents.send(IPC.ACCENT_APPLY, { color: accent })
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
  ipcMain.handle(IPC.HISTORY_GET,    ()                          => history.getAll())
  ipcMain.handle(IPC.HISTORY_REMOVE, (_, { id })                => { history.remove(id); return true })
  ipcMain.on(IPC.HISTORY_CLEAR,      ()                         => history.clear())
  ipcMain.handle(IPC.HISTORY_SEARCH, (_, { query, limit = 6 } = {}) => history.search(query, limit))

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
    if (key === 'accentColor')  broadcastAccent(value)
  })

  // ── Password manager ───────────────────────────────────────────────────────
  ipcMain.handle(IPC.PASSWORD_GET_ALL, ()                  => passwords.getAll())
  ipcMain.handle(IPC.PASSWORD_ADD,     (_, e)              => passwords.add(e))
  ipcMain.handle(IPC.PASSWORD_REMOVE,  (_, { id })         => { passwords.remove(id); return true })
  ipcMain.handle(IPC.PASSWORD_UPDATE,  (_, { id, ...p })   => passwords.update(id, p))
  ipcMain.handle(IPC.PASSWORD_FIND,    (_, { domain } = {}) => passwords.findByDomain(domain))

  // ── Dev pages ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.PERFORMANCE_GET, async event => {
    const manager = getManager(event)
    if (!manager) return { tabs: [], browserMB: 0 }
    const tabsList = await manager.getTabsMemoryInfo()
    let browserMB = 0
    try {
      const info = await process.getProcessMemoryInfo()
      browserMB = +(info.private / 1024).toFixed(1)
    } catch {}
    return { tabs: tabsList, browserMB }
  })

  ipcMain.handle(IPC.STORAGE_GET, async event => {
    return getManager(event)?.getActiveStorageData() ?? null
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

  // ── Tab move (drag to reorder) ─────────────────────────────────────────────
  ipcMain.on(IPC.TAB_MOVE, (event, { tabId, toIndex } = {}) => getManager(event)?.moveTab(tabId, toIndex))

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

  // ── Browsing data / download location ─────────────────────────────────────
  ipcMain.handle(IPC.CLEAR_BROWSING_DATA, async () => {
    await session.defaultSession.clearStorageData()
    history.clear()
    return true
  })

  ipcMain.handle(IPC.DOWNLOAD_LOCATION_CHOOSE, async event => {
    const bw = BrowserWindow.fromWebContents(event.sender)
    const current = settings.get('downloadLocation') || app.getPath('downloads')
    const result  = await dialog.showOpenDialog(bw, {
      title: 'Choose Download Location',
      defaultPath: current,
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return null
    const chosen = result.filePaths[0]
    settings.set('downloadLocation', chosen)
    return chosen
  })

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
