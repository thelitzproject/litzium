/**
 * javas/main/tab-manager.js
 * Manages all browser tabs via Electron's WebContentsView API.
 */

const { WebContentsView } = require('electron')
const path = require('path')
const IPC = require('../../dbus/ipc')

let win            = null
let chromeHeight   = 88   // base chrome height set during init
let expandedHeight = 88   // current effective top offset (may grow for dropdown)

/** @type {Map<string, Tab>} */
const tabs  = new Map()
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
  }
}

// ─── Init / bounds ────────────────────────────────────────────────────────────

function init(window, height) {
  win            = window
  chromeHeight   = height
  expandedHeight = height
}

function contentBounds() {
  const b = win.getContentBounds()
  return { x: 0, y: expandedHeight, width: b.width, height: Math.max(0, b.height - expandedHeight) }
}

/**
 * Called when the omnibox suggestions dropdown opens or closes.
 * Shifts the active WebContentsView downward while the dropdown is visible
 * so it doesn't render on top of the suggestion list.
 *
 * @param {boolean} isOpen
 * @param {number}  extraHeight  — extra pixels to add below normal chrome height
 */
function setOmniboxOpen(isOpen, extraHeight = 0) {
  expandedHeight = isOpen ? chromeHeight + extraHeight : chromeHeight
  updateAllBounds()
}

function applyBounds(view) {
  view.setBounds(contentBounds())
}

function updateAllBounds() {
  const tab = tabs.get(activeId)
  if (tab) applyBounds(tab.view)
}

// ─── Create ───────────────────────────────────────────────────────────────────

function createTab(url = 'litzium://newtab') {
  const id = String(idCounter++)

  // Trusted internal pages that need IPC (e.g. suggestions) get a preload.
  // External / unknown URLs keep the fully-sandboxed profile.
  const targetPage   = INTERNAL_PAGES[url]
  const preloadPath  = targetPage?.preload
    ? path.join(PROJECT_ROOT, targetPage.preload)
    : undefined

  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration:             false,
      contextIsolation:            true,
      // sandbox must be false when a preload needs require(); stays true otherwise
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
  })
}

// ─── Internal page registry ───────────────────────────────────────────────────
// Maps litzium:// URLs → relative paths under pages/
// Add a new entry here whenever a new internal page is created.

// Pages that need IPC access (getSuggestions, etc.) receive the page preload
// and run with sandbox:false.  All other internal pages remain fully sandboxed.
const PAGE_PRELOAD = 'javas/preload/page.js'

const INTERNAL_PAGES = {
  'litzium://newtab':      { file: 'pages/newtab/index.html',      title: 'New Tab',       preload: PAGE_PRELOAD },
  'litzium://version':     { file: 'pages/version/index.html',     title: 'Version' },
  'litzium://litz-urls':   { file: 'pages/litz-urls/index.html',   title: 'litzium URLs' },
  'litzium://about':       { file: 'pages/about/index.html',       title: 'About Litzium' },
  'litzium://settings':    { file: 'pages/settings/index.html',    title: 'Settings' },
  'litzium://flags':       { file: 'pages/flags/index.html',       title: 'Flags' },
  'litzium://debug':       { file: 'pages/debug/index.html',       title: 'Debug' },
  'litzium://history':     { file: 'pages/history/index.html',     title: 'History' },
  'litzium://bookmarks':   { file: 'pages/bookmarks/index.html',   title: 'Bookmarks' },
  'litzium://downloads':   { file: 'pages/downloads/index.html',   title: 'Downloads' },
  'litzium://predictions': { file: 'pages/predictions/index.html', title: 'Predictions',   preload: PAGE_PRELOAD },
}

// Root of the project (two levels up from javas/main/)
const PROJECT_ROOT = path.join(__dirname, '../../')

// ─── Load URL ─────────────────────────────────────────────────────────────────

function loadUrl(id, url) {
  const t = tabs.get(id); if (!t) return

  // Blank / explicit newtab
  if (!url) url = 'litzium://newtab'

  // Look up in the internal registry (exact match first)
  const page = INTERNAL_PAGES[url]
  if (page) {
    t.url    = url
    t.title  = page.title
    t.favicon = null
    t.view.webContents.loadFile(path.join(PROJECT_ROOT, page.file))
    return
  }

  // Prefix match for litzium:// URLs not in the registry → show litz-urls
  if (url.startsWith('litzium://')) {
    const fallback = INTERNAL_PAGES['litzium://litz-urls']
    t.url   = url
    t.title = fallback.title
    t.view.webContents.loadFile(path.join(PROJECT_ROOT, fallback.file))
    return
  }

  // Regular web URL
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
    const remaining = Array.from(tabs.keys())
    remaining.length > 0 ? switchTab(remaining[remaining.length - 1]) : createTab()
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function navigate(raw) {
  if (!activeId) return
  const url = (raw || '').trim()

  if (!url || url === 'litzium://newtab')                                   return loadUrl(activeId, 'litzium://newtab')
  if (url.startsWith('litzium://'))                                         return loadUrl(activeId, url)
  if (/^(https?|file|ftp):\/\//i.test(url))                                return loadUrl(activeId, url)
  if (/^(localhost|127\.|0\.0\.0\.0)/.test(url))                           return loadUrl(activeId, `http://${url}`)
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(\/.*)?$/.test(url))   return loadUrl(activeId, `https://${url}`)

  // Fallback: Google search
  loadUrl(activeId, `https://www.google.com/search?q=${encodeURIComponent(url)}`)
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

module.exports = { init, createTab, closeTab, switchTab, navigate, goBack, goForward, reload, stop, openDevTools, updateAllBounds, setOmniboxOpen }
