/**
 * javas/main/tab-manager.js
 * Factory — call createTabManager(win, chromeH) to get a per-window instance.
 */

const { WebContentsView, Menu, clipboard, app } = require('electron')
const path = require('path')
const fs   = require('fs')
const IPC      = require('../../dbus/ipc')
const history  = require('../../modules/history')
const search   = require('../../modules/search')
const settings = require('../../modules/settings')

// ─── Module-level constants (shared across all windows) ───────────────────────

const FIND_BAR_H  = 44
const SIDEBAR_W   = 280
const PAGE_PRELOAD = 'javas/preload/page.js'
const PROJECT_ROOT = path.join(__dirname, '../../')

const INTERNAL_PAGES = {
  'litzium://newtab':        { file: 'pages/newtab/index.html',        title: 'New Tab',       preload: PAGE_PRELOAD },
  'litzium://version':       { file: 'pages/version/index.html',       title: 'Version' },
  'litzium://litz-urls':     { file: 'pages/litz-urls/index.html',     title: 'litzium URLs' },
  'litzium://about':         { file: 'pages/about/index.html',         title: 'About Litzium' },
  'litzium://settings':      { file: 'pages/settings/index.html',      title: 'Settings',      preload: PAGE_PRELOAD },
  'litzium://flags':         { file: 'pages/flags/index.html',         title: 'Flags' },
  'litzium://debug':         { file: 'pages/debug/index.html',         title: 'Debug' },
  'litzium://history':       { file: 'pages/history/index.html',       title: 'History',       preload: PAGE_PRELOAD },
  'litzium://bookmarks':     { file: 'pages/bookmarks/index.html',     title: 'Bookmarks',     preload: PAGE_PRELOAD },
  'litzium://downloads':     { file: 'pages/downloads/index.html',     title: 'Downloads',     preload: PAGE_PRELOAD },
  'litzium://predictions':   { file: 'pages/predictions/index.html',   title: 'Predictions',   preload: PAGE_PRELOAD },
  'litzium://print-preview': { file: 'pages/print-preview/index.html', title: 'Print Preview', preload: PAGE_PRELOAD },
}

// ─── Session file (shared; only the first window manages it) ──────────────────

let _sessionFile = null
function getSessionFile() {
  if (!_sessionFile) _sessionFile = path.join(app.getPath('userData'), 'session.json')
  return _sessionFile
}

// ─── Tab class ────────────────────────────────────────────────────────────────

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
    this.pinned       = false
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createTabManager(win, chromeHeight = 88) {

  // ── Per-window state ──────────────────────────────────────────────────────
  let suggestionExtra      = 0
  let findBarExtra         = 0
  let shelfExtra           = 0
  let sidebarExtra         = 0   // sidebar pushes web content right
  let printPreviewTargetId = null

  const closedTabs = []
  const MAX_CLOSED = 50

  /** @type {Map<string, Tab>} */
  const tabs     = new Map()
  let activeId   = null
  let idCounter  = 1

  // ── Bounds ────────────────────────────────────────────────────────────────

  function contentBounds() {
    const b = win.getContentBounds()
    const y = chromeHeight + suggestionExtra + findBarExtra
    return {
      x:      sidebarExtra,
      y,
      width:  Math.max(0, b.width  - sidebarExtra),
      height: Math.max(0, b.height - y - shelfExtra),
    }
  }

  function applyBounds(view) { view.setBounds(contentBounds()) }

  function updateAllBounds() {
    const tab = tabs.get(activeId)
    if (tab) applyBounds(tab.view)
  }

  // ── Offset helpers ────────────────────────────────────────────────────────

  function setOmniboxOpen(isOpen, extraHeight = 0) {
    suggestionExtra = isOpen ? extraHeight : 0
    updateAllBounds()
  }

  function setFindBarOpen(isOpen) {
    findBarExtra = isOpen ? FIND_BAR_H : 0
    updateAllBounds()
  }

  function setShelfOpen(isOpen, height = 52) {
    shelfExtra = isOpen ? height : 0
    updateAllBounds()
  }

  function setSidebarOpen(isOpen) {
    sidebarExtra = isOpen ? SIDEBAR_W : 0
    updateAllBounds()
  }

  // ── IPC helpers ───────────────────────────────────────────────────────────

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

  // ── Create tab ────────────────────────────────────────────────────────────

  function createTab(url = 'litzium://newtab') {
    const id         = String(idCounter++)
    const targetPage = INTERNAL_PAGES[url]
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

  // ── Attach webContents events ──────────────────────────────────────────────

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
      // Internal pages load via loadFile() which fires did-navigate with a file:// URL.
      // Keep the litzium:// URL we already set so the address bar stays clean.
      if (url.startsWith('file://') && t.url.startsWith('litzium://')) {
        t.canGoBack    = wc.canGoBack()
        t.canGoForward = wc.canGoForward()
        toChrome(IPC.TAB_UPDATED, { id, url: t.url, canGoBack: t.canGoBack, canGoForward: t.canGoForward })
        if (id === activeId) sendNavState(id)
        return
      }
      t.url          = url
      t.canGoBack    = wc.canGoBack()
      t.canGoForward = wc.canGoForward()
      toChrome(IPC.TAB_UPDATED, { id, url, canGoBack: t.canGoBack, canGoForward: t.canGoForward })
      if (id === activeId) sendNavState(id)
      if (settings.get('saveHistory') !== false) {
        history.push({ url, title: t.title, favicon: t.favicon })
      }
    })

    wc.on('did-navigate-in-page', (_, url) => {
      const t = tabs.get(id); if (!t) return
      if (url.startsWith('file://') && t.url.startsWith('litzium://')) return
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

    wc.on('found-in-page', (_, result) => {
      if (id === activeId) {
        toChrome(IPC.FIND_RESULT, {
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches:            result.matches,
          finalUpdate:        result.finalUpdate,
        })
      }
    })

    wc.on('zoom-changed', (_, zoomDirection) => {
      const t = tabs.get(id); if (!t) return
      const STEP = 0.1
      const cur  = wc.getZoomFactor()
      const next = zoomDirection === 'in'
        ? Math.min(+(cur + STEP).toFixed(1), 5.0)
        : Math.max(+(cur - STEP).toFixed(1), 0.1)
      wc.setZoomFactor(next)
      t.zoomFactor = next
      if (id === activeId) toChrome(IPC.ZOOM_CHANGED, { tabId: id, zoomFactor: next })
    })

    wc.on('context-menu', (_, params) => {
      const { selectionText, linkURL, srcURL, mediaType, isEditable } = params
      const items = []

      if (linkURL) {
        items.push(
          { label: 'Open Link in New Tab', click: () => createTab(linkURL) },
          { label: 'Copy Link Address',    click: () => clipboard.writeText(linkURL) },
          { type: 'separator' },
        )
      }

      if (mediaType === 'image' && srcURL) {
        items.push(
          { label: 'Open Image in New Tab', click: () => createTab(srcURL) },
          { label: 'Copy Image URL',        click: () => clipboard.writeText(srcURL) },
          { type: 'separator' },
        )
      }

      if (selectionText.trim()) {
        const engine  = search.getDefault()
        const q       = selectionText.trim()
        const preview = q.length > 30 ? q.slice(0, 30) + '…' : q
        items.push(
          { label: 'Copy',                    role: 'copy' },
          { label: `Search for "${preview}"`, click: () => createTab(search.buildURL(q, engine.id)) },
          { type: 'separator' },
        )
      } else if (isEditable) {
        items.push(
          { label: 'Cut',   role: 'cut' },
          { label: 'Copy',  role: 'copy' },
          { label: 'Paste', role: 'paste' },
          { type: 'separator' },
        )
      }

      items.push(
        { label: 'Back',         enabled: wc.canGoBack(),    click: () => wc.goBack() },
        { label: 'Forward',      enabled: wc.canGoForward(), click: () => wc.goForward() },
        { label: 'Reload',       click: () => wc.reload() },
        { type: 'separator' },
        { label: 'Print Preview', click: () => openPrintPreview() },
        { label: 'Save as PDF',   click: () => toChrome(IPC.PRINT_TO_PDF, {}) },
        { type: 'separator' },
        { label: 'Inspect',       click: () => wc.openDevTools() },
      )

      const clean = items.filter((item, i, arr) => {
        if (item.type !== 'separator') return true
        if (i === 0 || i === arr.length - 1) return false
        return arr[i - 1].type !== 'separator'
      })

      if (clean.length) Menu.buildFromTemplate(clean).popup({ window: win })
    })

    wc.setWindowOpenHandler(({ url }) => {
      createTab(url)
      return { action: 'deny' }
    })

    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const ctrl = input.control || input.meta

      if      (ctrl && input.key === 't')                          { event.preventDefault(); createTab() }
      else if (ctrl && input.key === 'n')                          { event.preventDefault(); toChrome(IPC.WIN_NEW, {}) }
      else if (ctrl && input.key === 'w')                          { event.preventDefault(); closeTab(id) }
      else if ((ctrl && input.key === 'r') || input.key === 'F5') { event.preventDefault(); reload() }
      else if (ctrl && input.key === 'l')                          { event.preventDefault(); toChrome(IPC.FOCUS_OMNIBOX, {}) }
      else if (input.key === 'F12')                                { wc.toggleDevTools() }
      else if (input.key === 'Escape')                             { const t = tabs.get(id); if (t?.isLoading) stop() }
      else if (input.altKey && input.key === 'ArrowLeft')          { event.preventDefault(); goBack() }
      else if (input.altKey && input.key === 'ArrowRight')         { event.preventDefault(); goForward() }
      else if (ctrl && !input.shift && input.key === 'Tab')        { event.preventDefault(); cycleTab(1) }
      else if (ctrl &&  input.shift && input.key === 'Tab')        { event.preventDefault(); cycleTab(-1) }
      else if (ctrl && input.key === 'f')                          { event.preventDefault(); toChrome(IPC.FIND_BAR_OPEN, {}) }
      else if (ctrl && input.key === '0')                          { event.preventDefault(); resetZoom() }
      else if (ctrl && !input.shift && input.key === 'p')          { event.preventDefault(); openPrintPreview() }
      else if (ctrl &&  input.shift && input.key === 'p')          { event.preventDefault(); toChrome(IPC.PRINT_TO_PDF, {}) }
      else if (ctrl &&  input.shift && input.key === 'T')          { event.preventDefault(); reopenLastClosed() }
      else if (ctrl && input.key >= '1' && input.key <= '9') {
        event.preventDefault()
        const idx = input.key === '9' ? tabs.size - 1 : Number(input.key) - 1
        const ids = Array.from(tabs.keys())
        if (ids[idx]) switchTab(ids[idx])
      }
    })
  }

  // ── Load URL ──────────────────────────────────────────────────────────────

  function loadUrl(id, url) {
    const t = tabs.get(id); if (!t) return
    if (!url) url = 'litzium://newtab'

    const page = INTERNAL_PAGES[url]
    if (page) {
      t.url = url; t.title = page.title; t.favicon = null
      t.view.webContents.loadFile(path.join(PROJECT_ROOT, page.file))
      return
    }

    if (url.startsWith('litzium://')) {
      const fallback = INTERNAL_PAGES['litzium://litz-urls']
      t.url = url; t.title = fallback.title
      t.view.webContents.loadFile(path.join(PROJECT_ROOT, fallback.file))
      return
    }

    t.url = url
    t.view.webContents.loadURL(url)
  }

  // ── Switch / Close ────────────────────────────────────────────────────────

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
    toChrome(IPC.ZOOM_CHANGED, { tabId: id, zoomFactor: t.zoomFactor ?? 1 })
  }

  function closeTab(id) {
    const t = tabs.get(id); if (!t) return
    const wasActive = id === activeId

    if (t.url && !t.url.startsWith('litzium://') && !t.url.startsWith('file://')) {
      closedTabs.push({ url: t.url, title: t.title })
      if (closedTabs.length > MAX_CLOSED) closedTabs.shift()
    }

    win.contentView.removeChildView(t.view)
    t.view.webContents.close()
    tabs.delete(id)
    toChrome(IPC.TAB_CLOSED, { id })

    if (wasActive) {
      activeId = null
      setFindBarOpen(false)
      toChrome(IPC.FIND_BAR_CLOSE, {})
      const remaining = Array.from(tabs.keys())
      remaining.length > 0 ? switchTab(remaining[remaining.length - 1]) : createTab()
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function navigate(raw) {
    if (!activeId) return
    const url    = (raw || '').trim()
    const engine = search.getDefault()

    if (!url || url === 'litzium://newtab')                                  return loadUrl(activeId, 'litzium://newtab')
    if (url.startsWith('litzium://'))                                        return loadUrl(activeId, url)
    if (/^(https?|file|ftp):\/\//i.test(url))                               return loadUrl(activeId, url)
    if (/^(localhost|127\.|0\.0\.0\.0)/.test(url))                          return loadUrl(activeId, `http://${url}`)
    if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(\/.*)?$/.test(url))  return loadUrl(activeId, `https://${url}`)
    loadUrl(activeId, search.buildURL(url, engine.id))
  }

  function setSearchEngine(engineId) { search.setDefault(engineId) }

  function goBack()       { const t = tabs.get(activeId); if (t?.view.webContents.canGoBack())    t.view.webContents.goBack() }
  function goForward()    { const t = tabs.get(activeId); if (t?.view.webContents.canGoForward()) t.view.webContents.goForward() }
  function reload()       { tabs.get(activeId)?.view.webContents.reload() }
  function stop()         { tabs.get(activeId)?.view.webContents.stop() }
  function openDevTools() { tabs.get(activeId)?.view.webContents.openDevTools() }

  function cycleTab(dir) {
    const ids = Array.from(tabs.keys())
    if (ids.length <= 1) return
    const next = (ids.indexOf(activeId) + dir + ids.length) % ids.length
    switchTab(ids[next])
  }

  // ── Find in page ──────────────────────────────────────────────────────────

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

  // ── Zoom ──────────────────────────────────────────────────────────────────

  function resetZoom() {
    const t = tabs.get(activeId); if (!t) return
    t.view.webContents.setZoomFactor(1)
    t.zoomFactor = 1
    toChrome(IPC.ZOOM_CHANGED, { tabId: activeId, zoomFactor: 1 })
  }

  // ── Move tab (drag to reorder) ────────────────────────────────────────────

  function moveTab(tabId, toIndex) {
    if (!tabs.has(tabId)) return
    const entries = Array.from(tabs.entries())
    const from = entries.findIndex(([id]) => id === tabId)
    if (from < 0) return
    const [removed] = entries.splice(from, 1)
    const clamp = Math.max(0, Math.min(toIndex, entries.length))
    entries.splice(clamp, 0, removed)
    tabs.clear()
    entries.forEach(([id, tab]) => tabs.set(id, tab))
  }

  // ── Pinned tabs ───────────────────────────────────────────────────────────

  function pinTab(id) {
    const t = tabs.get(id); if (!t) return
    t.pinned = true
    toChrome(IPC.TAB_UPDATED, { id, pinned: true })
  }

  function unpinTab(id) {
    const t = tabs.get(id); if (!t) return
    t.pinned = false
    toChrome(IPC.TAB_UPDATED, { id, pinned: false })
  }

  // ── Reopen last closed tab ─────────────────────────────────────────────────

  function reopenLastClosed() {
    const entry = closedTabs.pop()
    if (entry) createTab(entry.url)
  }

  // ── Session ───────────────────────────────────────────────────────────────

  function saveSession() {
    const tabList = Array.from(tabs.values())
      .filter(t => t.url && !t.url.startsWith('litzium://') && !t.url.startsWith('file://'))
      .map(t => ({ url: t.url, title: t.title, pinned: t.pinned }))

    if (tabList.length === 0) { try { fs.unlinkSync(getSessionFile()) } catch {} return }

    try {
      fs.writeFileSync(getSessionFile(), JSON.stringify({
        tabs: tabList, activeUrl: tabs.get(activeId)?.url, savedAt: Date.now(),
      }), 'utf8')
    } catch (e) { console.warn('[session] save failed:', e.message) }
  }

  function loadSession() {
    try {
      const data = JSON.parse(fs.readFileSync(getSessionFile(), 'utf8'))
      return (data?.tabs?.length > 0) ? data : null
    } catch { return null }
  }

  function clearSession() { try { fs.unlinkSync(getSessionFile()) } catch {} }

  function restoreSession() {
    const data = loadSession()
    if (!data) return
    clearSession()
    data.tabs.forEach(t => createTab(t.url))
  }

  // ── Print Preview ─────────────────────────────────────────────────────────

  function openPrintPreview() {
    if (!activeId) return
    printPreviewTargetId = activeId
    createTab('litzium://print-preview')
  }

  function getPrintPreviewTarget() {
    if (!printPreviewTargetId) return null
    return tabs.get(printPreviewTargetId)?.view.webContents ?? null
  }

  function getActiveWebContents() {
    return tabs.get(activeId)?.view.webContents ?? null
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    init() { search.setDefault(settings.get('searchEngine') ?? 'google') },
    createTab, closeTab, switchTab,
    navigate, goBack, goForward, reload, stop, openDevTools,
    updateAllBounds, setOmniboxOpen, setFindBarOpen, setShelfOpen, setSidebarOpen,
    findInPage, findNext, stopFindInPage,
    resetZoom, setSearchEngine,
    getActiveWebContents,
    openPrintPreview, getPrintPreviewTarget,
    moveTab,
    pinTab, unpinTab,
    reopenLastClosed,
    saveSession, loadSession, clearSession, restoreSession,
    get size() { return tabs.size },
  }
}

module.exports = { createTabManager }
