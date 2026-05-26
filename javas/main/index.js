const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('path')
const IPC = require('../../dbus/ipc')
const tabs = require('./tab-manager')
const { fetchSuggestions } = require('./suggestions')
const history   = require('../../modules/history')
const bookmarks = require('../../modules/bookmarks')
const downloads = require('../../modules/downloads')
const settings  = require('../../modules/settings')
const printer   = require('../../printing/print')
const CHROME_HEIGHT = 88

let win = null

function createWindow() {
  win = new BrowserWindow({
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
      sandbox: false, // must be false so preload can require() modules
    },
  })

  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, '../../pages/browser.html'))

  win.once('ready-to-show', () => {
    win.show()
    tabs.init(win, CHROME_HEIGHT)
    tabs.createTab('litzium://newtab')

    // Wire download tracking to the default session
    downloads.setup(session.defaultSession, win, IPC)
  })

  win.on('resize',     () => tabs.updateAllBounds())
  win.on('maximize',   () => { win.webContents.send(IPC.WIN_MAXIMIZED, true);  tabs.updateAllBounds() })
  win.on('unmaximize', () => { win.webContents.send(IPC.WIN_MAXIMIZED, false); tabs.updateAllBounds() })
}

function setupIPC() {
  // ── Window controls ────────────────────────────────────────────────────
  ipcMain.on(IPC.WIN_MINIMIZE,  () => win?.minimize())
  ipcMain.on(IPC.WIN_MAXIMIZE,  () => win?.isMaximized() ? win.unmaximize() : win?.maximize())
  ipcMain.on(IPC.WIN_CLOSE,     () => win?.close())

  // ── Tabs ───────────────────────────────────────────────────────────────
  ipcMain.on(IPC.TAB_NEW,    (_, url)   => tabs.createTab(url))
  ipcMain.on(IPC.TAB_CLOSE,  (_, tabId) => tabs.closeTab(tabId))
  ipcMain.on(IPC.TAB_SWITCH, (_, tabId) => tabs.switchTab(tabId))

  // ── Navigation ─────────────────────────────────────────────────────────
  ipcMain.on(IPC.NAV_GO,      (_, url) => tabs.navigate(url))
  ipcMain.on(IPC.NAV_BACK,    ()       => tabs.goBack())
  ipcMain.on(IPC.NAV_FORWARD, ()       => tabs.goForward())
  ipcMain.on(IPC.NAV_RELOAD,  ()       => tabs.reload())
  ipcMain.on(IPC.NAV_STOP,    ()       => tabs.stop())
  ipcMain.on(IPC.NAV_HOME,    ()       => tabs.navigate('litzium://newtab'))
  ipcMain.on(IPC.DEVTOOLS_OPEN, () => tabs.openDevTools())

  // ── Autocomplete suggestions ───────────────────────────────────────────
  ipcMain.handle(IPC.SUGGESTIONS_GET, async (_, { query, provider } = {}) => {
    // Respect the user's configured suggestions provider unless overridden
    const p = provider ?? settings.get('suggestionsProvider') ?? 'google'
    return fetchSuggestions(query, p)
  })
  ipcMain.on(IPC.OMNIBOX_EXPAND,   (_, { height } = {}) => tabs.setOmniboxOpen(true,  height ?? 0))
  ipcMain.on(IPC.OMNIBOX_COLLAPSE, ()                   => tabs.setOmniboxOpen(false, 0))

  // ── History ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.HISTORY_GET,    ()         => history.getAll())
  ipcMain.handle(IPC.HISTORY_REMOVE, (_, { id }) => { history.remove(id); return true })
  ipcMain.on(IPC.HISTORY_CLEAR,      ()         => history.clear())

  // ── Bookmarks ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.BOOKMARK_GET_ALL, () => bookmarks.getAll())
  ipcMain.handle(IPC.BOOKMARK_IS,      (_, { url }) => bookmarks.has(url))
  ipcMain.handle(IPC.BOOKMARK_REMOVE,  (_, { id })  => { bookmarks.remove(id); return true })
  ipcMain.handle(IPC.BOOKMARK_TOGGLE,  (_, { url, title, favicon }) => {
    if (bookmarks.has(url)) {
      bookmarks.remove(url)   // remove() accepts url
      win?.webContents.send(IPC.BOOKMARK_STATE, { url, isBookmarked: false })
      return { isBookmarked: false }
    } else {
      const bm = bookmarks.add({ url, title, favicon })
      win?.webContents.send(IPC.BOOKMARK_STATE, { url, isBookmarked: true })
      return { isBookmarked: true, bookmark: bm }
    }
  })

  // ── Downloads ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.DOWNLOAD_GET_ALL, () => downloads.getAll())
  ipcMain.on(IPC.DOWNLOAD_OPEN,        (_, { id }) => downloads.openFile(id))
  ipcMain.on(IPC.DOWNLOAD_SHOW,        (_, { id }) => downloads.showInFolder(id))
  ipcMain.on(IPC.DOWNLOAD_CLEAR,       ()          => downloads.clear())

  // ── Settings ───────────────────────────────────────────────────────────
  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => settings.getAll())
  ipcMain.on(IPC.SETTINGS_SET, (_, { key, value }) => {
    settings.set(key, value)
    // Live-apply search engine change
    if (key === 'searchEngine') tabs.setSearchEngine(value)
  })

  // ── Find in page ───────────────────────────────────────────────────────
  ipcMain.on(IPC.FIND_START,    (_, { text, forward = true } = {}) => tabs.findInPage(text, forward))
  ipcMain.on(IPC.FIND_STOP,     () => tabs.stopFindInPage())
  ipcMain.on(IPC.FIND_BAR_OPEN,  () => tabs.setFindBarOpen(true))
  ipcMain.on(IPC.FIND_BAR_CLOSE, () => tabs.setFindBarOpen(false))

  // ── Zoom ───────────────────────────────────────────────────────────────
  ipcMain.on(IPC.ZOOM_RESET, () => tabs.resetZoom())

  // ── Print ───────────────────────────────────────────────────────────────
  ipcMain.on(IPC.PRINT, async () => {
    const wc = tabs.getActiveWebContents()
    if (!wc) return
    const result = await printer.printPage(wc)
    win?.webContents.send(IPC.PRINT_RESULT, result)
  })

  ipcMain.on(IPC.PRINT_TO_PDF, async () => {
    const wc = tabs.getActiveWebContents()
    if (!wc || !win) return
    const result = await printer.savePDF(wc, win)
    win?.webContents.send(IPC.PRINT_RESULT, result)
  })

  // ── Print Preview ──────────────────────────────────────────────────────────
  ipcMain.on(IPC.PRINT_PREVIEW_OPEN, () => tabs.openPrintPreview())
  ipcMain.handle(IPC.PRINT_PREVIEW_GENERATE, async (_, opts = {}) => {
    const wc = tabs.getPrintPreviewTarget()
    if (!wc) return { success: false, error: 'No print target available' }
    return printer.generatePreviewPDF(wc, opts)
  })

  ipcMain.handle(IPC.PRINT_PREVIEW_PRINT, async (_, opts = {}) => {
    const wc = tabs.getPrintPreviewTarget()
    if (!wc) return { success: false, failureReason: 'No print target available' }
    return printer.printPage(wc, opts)
  })

  ipcMain.handle(IPC.PRINT_PREVIEW_SAVE, async (_, opts = {}) => {
    const wc = tabs.getPrintPreviewTarget()
    if (!wc || !win) return { saved: false, error: 'No print target available' }
    return printer.savePDF(wc, win, opts)
  })
}


app.whenReady().then(() => {
  createWindow()
  setupIPC()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
