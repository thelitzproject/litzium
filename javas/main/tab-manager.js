/**
 * javas/main/tab-manager.js
 * Manages all browser tabs via Electron's WebContentsView API.
 */

const { WebContentsView } = require('electron')
const path = require('path')
const IPC      = require('../../dbus/ipc')
const history  = require('../../modules/history')
const search   = require('../../modules/search')
const settings = require('../../modules/settings')

let win            = null
let chromeHeight   = 88   // base chrome height set during init
let suggestionExtra = 0   // extra px from open suggestions dropdown
let findBarExtra    = 0   // extra px from open find bar

const FIND_BAR_H = 44

/** @type {Map<string, Tab>} */
const tabs   = new Map()
let activeId    = null
let idCounter   = 1

class Tab {
  constructor(id, view) {
    this.id           = id
    this.view         = view
    this.url          = ''
    this.title        = 'New Tab'
    this.favicon      = null
    this.isLoading    = false
    this.canGoBack    = false
    this.canGoForward = false
    this.zoomFactor   = 1
  }
}

// ─── Init / bounds ────────────────────────────────────────────────────────────

function init(window, height) {
  win          = window
  chromeHeight = height
  // Apply persisted search engine on startup
  search.setDefault(settings.get('searchEngine') ?? 'google')
}

function contentBounds() {
  const b = win.getContentBounds()
  const y = chromeHeight + suggestionExtra + findBarExtra
  return { x: 0, y, width: b.width, height: Math.max(0, b.height - y) }
}

function applyBounds(view) {
  view.setBounds(contentBounds())
}

function updateAllBounds() {
  const tab = tabs.get(activeId)
  if (tab) applyBounds(tab.view)
}

// ─── Chrome height management ─────────────────────────────────────────────────

/**
 * Expand/collapse the WebContentsView offset for the suggestions dropdown.
 * @param {boolean} isOpen
 * @param {number}  extraHeight
 */
function setOmniboxOpen(isOpen, extraHeight = 0) {
  suggestionExtra = isOpen ? extraHeight : 0
  updateAllBounds()
}

/**
 * Expand/collapse the WebContentsView offset for the find bar.
 * @param {boolean} isOpen
 */
function setFindBarOpen(isOpen) {
  findBarExtra = isOpen ? FIND_BAR_H : 0
  updateAllBounds()
}

// ─── Internal page registry ───────────────────────────────────────────────────

// Pages that need IPC access receive the page preload (sandbox: false)
const PAGE_PRELOAD = 'javas/preload/page.js'

const INTERNAL_PAGES = {
  'litzium://newtab':      { file: 'pages/newtab/index.html',      title: 'New Tab',       preload: PAGE_PRELOAD },
  'litzium://version':     { file: 'pages/version/index.html',     title: 'Version' },
  'litzium://litz-urls':   { file: 'pages/litz-urls/index.html',   title: 'litzium URLs' },
  'litzium://about':       { file: 'pages/about/index.html',       title: 'About Litzium' },
  'litzium://settings':    { file: 'pages/settings/index.html',    title: 'Settings',      preload: PAGE_PRELOAD },
  'litzium://flags':       { file: 'pages/flags/index.html',       title: 'Flags' },
  'litzium://debug':       { file: 'pages/debug/index.html',       title: 'Debug' },
  'litzium://history':     { file: 'pages/history/index.html',     title: 'History',       preload: PAGE_PRELOAD },
  'litzium://bookmarks':   { file: 'pages/bookmarks/index.html',   title: 'Bookmarks',     preload: PAGE_PRELOAD },
  'litzium://downloads':   { file: 'pages/downloads/index.html',   title: 'Downloads',     preload: PAGE_PRELOAD },
  'litzium://predictions': { file: 'pages/predictions/index.html', title: 'Predictions',   preload: PAGE_PRELOAD },
}

// Root of the project (two levels up from javas/main/)
const PROJECT_ROOT = path.join(__dirname, '../../')

// ─── Create ───────────────────────────────────────────────────────────────────

function createTab(url = 'litzium://newtab') {
  const id = String(idCounter++)

  // Trusted internal pages that need IPC get a preload (sandbox: false)
  const targetPage  = INTERNAL_PAGES[url]
  const preloadPath = targetPage?.preload
    ? path.join(PROJECT_ROOT, targetPage.preload)
    : undefined

  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration:             false,
      contextIsolation:            true,
      sandbox:                     !preloadPath,
      webSecurity:                 true,
      allowRunningInsecureContent: false,
      ...(preloadPath ? { preload: preloadPath } : {}),
    },
  })

  const tab = new Tab(id, view)
  tabs.set(id, tab)

  win.contentView.addChildView(view)
  applyBounds(view)
  view.setVisible(false)

  attachEvents(id, view)
  switchTab(id)
  loadUrl(id, url)

  toChrome(IPC.TAB_CREATED, { id, title: tab.title, favicon: null, isLoading: false, isActive: true })
  return id
}

// ─── Attach webContents events ────────────────────────────────────────────────

function attachEvents(id, view) {
  const wc = view.webContents

  wc.on('did-start-loading', () => {
    const t = tabs.get(id); if (!t) return
    t.isLoading = true
    toChrome(IPC.TAB_UPDATED, { id, isLoading: true })
    if (id === activeId) sendNavState(id)
  })

  wc.on('did-stop-loading', () => {
    const t = tabs.get(id); if (!t) return
    t.isLoading    = false
    t.canGoBack    = wc.canGoBack()
    t.canGoForward = wc.canGoForward()
    toChrome(IPC.TAB_UPDATED, { id, isLoading: false, canGoBack: t.canGoBack, canGoForward: t.canGoForward })
    if (id === activeId) sendNavState(id)
  })

  wc.on('did-navigate', (_, url) => {
    const t = tabs.get(id); if (!t) return
    t.url          = url
    t.canGoBack    = wc.canGoBack()
    t.canGoForward = wc.canGoForward()
    toChrome(IPC.TAB_UPDATED, { id, url, canGoBack: t.canGoBack, canGoForward: t.canGoForward })
    if (id === activeId) sendNavState(id)

    // Record in history (external pages only; skip internal/file URLs)
    if (settings.get('saveHistory') !== false) {
      history.push({ url, title: t.title, favicon: t.favicon })
    }
  })

  wc.on('did-navigate-in-page', (_, url) => {
    const t = tabs.get(id); if (!t) return
    t.url          = url
    t.canGoBack    = wc.canGoBack()
    t.canGoForward = wc.canGoForward()
    toChrome(IPC.TAB_UPDATED, { id, url, canGoBack: t.canGoBack, canGoForward: t.canGoForward })
    if (id === activeId) sendNavState(id)
  })

  wc.on('page-title-updated', (_, title) => {
    const t = tabs.get(id); if (!t) return
    t.title = title || 'Untitled'
    toChrome(IPC.TAB_UPDATED, { id, title: t.title })
  })

  wc.on('page-favicon-updated', (_, favicons) => {
    const t = tabs.get(id); if (!t) return
    t.favicon = favicons[0] || null
    toChrome(IPC.TAB_UPDATED, { id, favicon: t.favicon })
  })

  // Find-in-page results
  wc.on('found-in-page', (_, result) => {
    if (id === activeId) {
      toChrome(IPC.FIND_RESULT, {
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches:            result.matches,
        finalUpdate:        result.finalUpdate,
      })
    }
  })

  // Zoom via Ctrl+Scroll
  wc.on('zoom-changed', (_, zoomDirection) => {
    const t = tabs.get(id); if (!t) return
    const STEP  = 0.1
    const cur   = wc.getZoomFactor()
    const next  = zoomDirection === 'in'
      ? Math.min(+(cur + STEP).toFixed(1), 5.0)
      : Math.max(+(cur - STEP).toFixed(1), 0.1)
    wc.setZoomFactor(next)
    t.zoomFactor = next
    if (id === activeId) toChrome(IPC.ZOOM_CHANGED, { tabId: id, zoomFactor: next })
  })

  // Open new windows as a tab instead
  wc.setWindowOpenHandler(({ url }) => {
    createTab(url)
    return { action: 'deny' }
  })

  // Browser-level keyboard shortcuts while web content is focused
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const ctrl = input.control || input.meta

    if      (ctrl && input.key === 't')                              { event.preventDefault(); createTab() }
    else if (ctrl && input.key === 'w')                              { event.preventDefault(); closeTab(id) }
    else if ((ctrl && input.key === 'r') || input.key === 'F5')     { event.preventDefault(); reload() }
    else if (ctrl && input.key === 'l')                              { event.preventDefault(); toChrome(IPC.FOCUS_OMNIBOX, {}) }
    else if (input.key === 'F12')                                    { wc.toggleDevTools() }
    else if (input.key === 'Escape')                                 { const t = tabs.get(id); if (t?.isLoading) stop() }
    else if (input.altKey && input.key === 'ArrowLeft')              { event.preventDefault(); goBack() }
    else if (input.altKey && input.key === 'ArrowRight')             { event.preventDefault(); goForward() }
    else if (ctrl && !input.shift && input.key === 'Tab')            { event.preventDefault(); cycleTab(1) }
    else if (ctrl &&  input.shift && input.key === 'Tab')            { event.preventDefault(); cycleTab(-1) }
    else if (ctrl && input.key === 'f')                              { event.preventDefault(); toChrome(IPC.FIND_BAR_OPEN, {}) }
    else if (ctrl && input.key === '0')                              { event.preventDefault(); resetZoom() }
    // Ctrl+1–9 tab switching
    else if (ctrl && input.key >= '1' && input.key <= '9') {
      event.preventDefault()
      const idx = input.key === '9'
        ? tabs.size - 1
        : Number(input.key) - 1
      const ids = Array.from(tabs.keys())
      if (ids[idx]) switchTab(ids[idx])
    }
  })
}

// ─── Load URL ─────────────────────────────────────────────────────────────────

function loadUrl(id, url) {
  const t = tabs.get(id); if (!t) return

  if (!url) url = 'litzium://newtab'

  const page = INTERNAL_PAGES[url]
  if (page) {
    t.url   = url
    t.title = page.title
    t.favicon = null
    t.view.webContents.loadFile(path.join(PROJECT_ROOT, page.file))
    return
  }

  // Unknown litzium:// → litz-urls fallback
  if (url.startsWith('litzium://')) {
    const fallback = INTERNAL_PAGES['litzium://litz-urls']
    t.url   = url
    t.title = fallback.title
    t.view.webContents.loadFile(path.join(PROJECT_ROOT, fallback.file))
    return
  }

  t.url = url
  t.view.webContents.loadURL(url)
}

// ─── Switch / Close ───────────────────────────────────────────────────────────

function switchTab(id) {
  const t = tabs.get(id); if (!t) return

  if (activeId && activeId !== id) {
    const prev = tabs.get(activeId)
    if (prev) prev.view.setVisible(false)
  }

  activeId = id
  t.view.setVisible(true)
  applyBounds(t.view)

  toChrome(IPC.TAB_SWITCHED, { id })
  sendNavState(id)
  // Notify chrome of zoom level for the switched-to tab
  toChrome(IPC.ZOOM_CHANGED, { tabId: id, zoomFactor: t.zoomFactor ?? 1 })
}

function closeTab(id) {
  const t = tabs.get(id); if (!t) return
  const wasActive = id === activeId

  win.contentView.removeChildView(t.view)
  t.view.webContents.close()
  tabs.delete(id)

  toChrome(IPC.TAB_CLOSED, { id })

  if (wasActive) {
    activeId = null
    // Also close the find bar if it was open
    setFindBarOpen(false)
    toChrome(IPC.FIND_BAR_CLOSE, {})

    const remaining = Array.from(tabs.keys())
    remaining.length > 0 ? switchTab(remaining[remaining.length - 1]) : createTab()
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function navigate(raw) {
  if (!activeId) return
  const url = (raw || '').trim()
  const engine = search.getDefault()

  if (!url || url === 'litzium://newtab')                                   return loadUrl(activeId, 'litzium://newtab')
  if (url.startsWith('litzium://'))                                         return loadUrl(activeId, url)
  if (/^(https?|file|ftp):\/\//i.test(url))                                return loadUrl(activeId, url)
  if (/^(localhost|127\.|0\.0\.0\.0)/.test(url))                           return loadUrl(activeId, `http://${url}`)
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(\/.*)?$/.test(url))   return loadUrl(activeId, `https://${url}`)

  // Fallback: configured search engine
  loadUrl(activeId, search.buildURL(url, engine.id))
}

/** Change the default search engine (called when setting changes). */
function setSearchEngine(engineId) {
  search.setDefault(engineId)
}

function goBack()    { const t = tabs.get(activeId); if (t?.view.webContents.canGoBack())    t.view.webContents.goBack() }
function goForward() { const t = tabs.get(activeId); if (t?.view.webContents.canGoForward()) t.view.webContents.goForward() }
function reload()    { tabs.get(activeId)?.view.webContents.reload() }
function stop()      { tabs.get(activeId)?.view.webContents.stop() }
function openDevTools() { tabs.get(activeId)?.view.webContents.openDevTools() }

function cycleTab(dir) {
  const ids = Array.from(tabs.keys())
  if (ids.length <= 1) return
  const next = (ids.indexOf(activeId) + dir + ids.length) % ids.length
  switchTab(ids[next])
}

// ─── Find in page ─────────────────────────────────────────────────────────────

function findInPage(text, forward = true) {
  const t = tabs.get(activeId); if (!t || !text) return
  t.view.webContents.findInPage(text, { forward, findNext: false })
}

function findNext(text, forward = true) {
  const t = tabs.get(activeId); if (!t || !text) return
  t.view.webContents.findInPage(text, { forward, findNext: true })
}

function stopFindInPage() {
  tabs.get(activeId)?.view.webContents.stopFindInPage('clearSelection')
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────

function resetZoom() {
  const t = tabs.get(activeId); if (!t) return
  t.view.webContents.setZoomFactor(1)
  t.zoomFactor = 1
  toChrome(IPC.ZOOM_CHANGED, { tabId: activeId, zoomFactor: 1 })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toChrome(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data)
}

function sendNavState(id) {
  const t = tabs.get(id); if (!t) return
  toChrome(IPC.NAV_STATE, {
    tabId:        id,
    url:          t.url,
    title:        t.title,
    favicon:      t.favicon,
    canGoBack:    t.canGoBack,
    canGoForward: t.canGoForward,
    isLoading:    t.isLoading,
  })
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  init,
  createTab, closeTab, switchTab,
  navigate, goBack, goForward, reload, stop, openDevTools,
  updateAllBounds, setOmniboxOpen, setFindBarOpen,
  findInPage, findNext, stopFindInPage,
  resetZoom, setSearchEngine,
  get size() { return tabs.size },
}
