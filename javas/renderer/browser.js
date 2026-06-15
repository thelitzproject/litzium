
'use strict'
const tabStore = new Map()   // tabId → { el, data }
let activeTabId = null

// ─── Tab Groups (renderer-managed, per-session) ───────────────────────────────

const groupMeta   = new Map()   // groupId → { name, color, collapsed }
const tabGroupMap = new Map()   // tabId → groupId
let   groupCounter = 0
const GROUP_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899']

// ─── Drag-to-reorder state ────────────────────────────────────────────────────

let dragTabId = null

const $ = id => document.getElementById(id)

const tabsContainer      = $('tabs-container')
const newTabBtn          = $('new-tab-btn')
const backBtn            = $('back-btn')
const forwardBtn         = $('forward-btn')
const reloadBtn          = $('reload-btn')
const icoReload          = $('ico-reload')
const icoStop            = $('ico-stop')
const devtoolsBtn        = $('devtools-btn')
const settingsBtn        = $('settings-btn')
const sidebarBtn         = $('sidebar-btn')
const sidebar            = $('sidebar')
const sidebarCloseBtn    = $('sidebar-close-btn')
const sidebarSearch      = $('sidebar-search')
const sidebarPanelBm     = $('sidebar-panel-bookmarks')
const sidebarPanelHist   = $('sidebar-panel-history')
const omnibox            = $('omnibox')
const addressBar         = $('address-bar')
const icoGlobe           = $('ico-globe')
const icoLock            = $('ico-lock')
const icoFavicon         = $('ico-favicon')
const progressFill       = $('progress-fill')
const winMinimize        = $('win-minimize')
const winMaximize        = $('win-maximize')
const winClose           = $('win-close')
const icoMaximize        = $('ico-maximize')
const icoRestore         = $('ico-restore')
const starBtn            = $('star-btn')
const icoStarEmpty       = $('ico-star-empty')
const icoStarFilled      = $('ico-star-filled')
const zoomPill           = $('zoom-pill')
const zoomLabel          = $('zoom-label')
const suggestionsDropdown = $('suggestions-dropdown')
const findBar            = $('find-bar')
const findInput          = $('find-input')
const findCount          = $('find-count')
const findPrev           = $('find-prev')
const findNext           = $('find-next')
const findClose          = $('find-close')
const dlBtn              = $('dl-btn')
const dlBadge            = $('dl-badge')
const browserChrome      = $('browser-chrome')
const sessionBanner      = $('session-banner')
const sessionRestoreBtn  = $('session-restore-btn')
const sessionDismissBtn  = $('session-dismiss-btn')
const downloadShelf      = $('download-shelf')
const shelfItems         = $('shelf-items')
const shelfClose         = $('shelf-close')
const tabCtxMenu         = $('tab-ctx-menu')

const BASE_CHROME_H = 88   // must match CHROME_HEIGHT in index.js
const FIND_BAR_H    = 44
const SHELF_H       = 52

// ─── Window controls ──────────────────────────────────────────────────────────

winMinimize.addEventListener('click', () => window.litzium.minimizeWindow())
winMaximize.addEventListener('click', () => window.litzium.maximizeWindow())
winClose.addEventListener('click',    () => window.litzium.closeWindow())

window.litzium.on(window.litzium.channels.WIN_MAXIMIZED, (maximized) => {
  icoMaximize.style.display = maximized ? 'none' : ''
  icoRestore.style.display  = maximized ? '' : 'none'
  winMaximize.title = maximized ? 'Restore' : 'Maximize'
})

// ─── Drop indicator (appended to tabsContainer at startup) ───────────────────

const dropIndicator = document.createElement('div')
dropIndicator.className = 'tab-drop-indicator'
dropIndicator.hidden = true
tabsContainer.appendChild(dropIndicator)

// ─── Tab Groups ───────────────────────────────────────────────────────────────

function createGroup(name, color) {
  const id = `g${++groupCounter}`
  groupMeta.set(id, { name, color: color || GROUP_COLORS[(groupCounter - 1) % GROUP_COLORS.length], collapsed: false })
  return id
}

function assignGroup(tabId, groupId) {
  tabGroupMap.set(tabId, groupId)
  rebuildGroupLabels()
}

function removeFromGroup(tabId) {
  tabGroupMap.delete(tabId)
  rebuildGroupLabels()
}

function toggleGroupCollapse(groupId) {
  const meta = groupMeta.get(groupId)
  if (!meta) return
  meta.collapsed = !meta.collapsed
  rebuildGroupLabels()
}

function renameGroup(groupId, labelEl) {
  const meta = groupMeta.get(groupId)
  if (!meta) return
  const span = labelEl.querySelector('.tab-group-name')
  if (!span) return
  span.contentEditable = 'true'
  span.focus()
  document.execCommand('selectAll', false, null)
  const done = () => {
    span.contentEditable = 'false'
    meta.name = span.textContent.trim() || meta.name
    span.textContent = meta.name
  }
  span.addEventListener('blur', done, { once: true })
  span.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); span.blur() } }, { once: true })
}

function deleteGroup(groupId) {
  for (const [tid, gid] of tabGroupMap) {
    if (gid === groupId) tabGroupMap.delete(tid)
  }
  groupMeta.delete(groupId)
  rebuildGroupLabels()
}

function rebuildGroupLabels() {
  tabsContainer.querySelectorAll('.tab-group-label').forEach(el => el.remove())
  if (groupMeta.size === 0) {
    tabStore.forEach(({ el }) => { el.style.removeProperty('--group-color'); el.classList.remove('in-group') })
    tabStore.forEach(({ el }) => { el.style.display = '' })
    return
  }

  const tabEls = [...tabsContainer.querySelectorAll('.tab')]
  let prevGroupId = null

  tabEls.forEach(tabEl => {
    const tabId   = tabEl.dataset.tabId
    const groupId = tabGroupMap.get(tabId)

    if (groupId && groupId !== prevGroupId) {
      const meta  = groupMeta.get(groupId)
      if (meta) {
        const label = document.createElement('div')
        label.className = 'tab-group-label'
        label.dataset.groupId = groupId
        label.style.setProperty('--group-color', meta.color)
        label.innerHTML = `<span class="tab-group-dot"></span><span class="tab-group-name">${escHtml(meta.name)}</span>`
        label.querySelector('.tab-group-dot').addEventListener('click', () => toggleGroupCollapse(groupId))
        label.querySelector('.tab-group-name').addEventListener('click', () => toggleGroupCollapse(groupId))
        label.addEventListener('contextmenu', e => {
          e.preventDefault()
          e.stopPropagation()
          showGroupCtxMenu(e, groupId, label)
        })
        tabsContainer.insertBefore(label, tabEl)
      }
    }

    prevGroupId = groupId || null

    if (groupId) {
      const meta = groupMeta.get(groupId)
      if (meta) {
        tabEl.style.setProperty('--group-color', meta.color)
        tabEl.classList.add('in-group')
        tabEl.style.display = meta.collapsed ? 'none' : ''
      }
    } else {
      tabEl.style.removeProperty('--group-color')
      tabEl.classList.remove('in-group')
      tabEl.style.display = ''
    }
  })
}

function showGroupCtxMenu(e, groupId, labelEl) {
  hideTabCtxMenu()
  const items = [
    { label: 'Rename Group',  action: () => renameGroup(groupId, labelEl) },
    { label: 'Delete Group',  action: () => deleteGroup(groupId), danger: true },
  ]
  items.forEach(item => {
    const div = document.createElement('div')
    div.className = 'ctx-item' + (item.danger ? ' danger' : '')
    div.textContent = item.label
    div.addEventListener('click', () => { item.action(); hideTabCtxMenu() })
    tabCtxMenu.appendChild(div)
  })
  tabCtxMenu.style.display = 'block'
  const x = Math.min(e.clientX, window.innerWidth  - 170)
  const y = Math.min(e.clientY, window.innerHeight - tabCtxMenu.offsetHeight - 8)
  tabCtxMenu.style.left = x + 'px'
  tabCtxMenu.style.top  = y + 'px'
}

// ─── Drag to reorder ──────────────────────────────────────────────────────────

function getDropTarget(clientX) {
  const els = [...tabsContainer.querySelectorAll('.tab:not(.dragging)')]
  const cr  = tabsContainer.getBoundingClientRect()
  for (const t of els) {
    const r = t.getBoundingClientRect()
    if (clientX < r.left + r.width / 2) return { before: t, x: r.left - cr.left }
  }
  const last = els[els.length - 1]
  return { before: null, x: last ? last.getBoundingClientRect().right - cr.left : 0 }
}

function startDrag(tabId, pointerId, clientX) {
  dragTabId = tabId
  const entry = tabStore.get(tabId)
  if (!entry) return
  entry.el.classList.add('dragging')
  entry.el.setPointerCapture(pointerId)
  dropIndicator.hidden = false
  const { x } = getDropTarget(clientX)
  dropIndicator.style.left = `${x}px`
}

function updateDragIndicator(clientX) {
  const { x } = getDropTarget(clientX)
  dropIndicator.style.left = `${x}px`
}

function commitDrag(clientX) {
  if (!dragTabId) return
  const entry = tabStore.get(dragTabId)
  const { before } = getDropTarget(clientX)
  if (entry) {
    entry.el.classList.remove('dragging')
    if (before) tabsContainer.insertBefore(entry.el, before)
    else         tabsContainer.insertBefore(entry.el, dropIndicator)
  }
  dropIndicator.hidden = true
  const allTabEls = [...tabsContainer.querySelectorAll('.tab')]
  const toIndex   = allTabEls.indexOf(entry?.el ?? null)
  if (toIndex >= 0) window.litzium.moveTab(dragTabId, toIndex)
  dragTabId = null
  rebuildGroupLabels()
}

function cancelDrag() {
  if (!dragTabId) return
  tabStore.get(dragTabId)?.el.classList.remove('dragging')
  dropIndicator.hidden = true
  dragTabId = null
}

// ─── Tab SVGs ─────────────────────────────────────────────────────────────────

const GLOBE_SVG = `<svg viewBox="0 0 20 20" fill="currentColor">
  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clip-rule="evenodd"/>
</svg>`

const SPINNER_SVG = `<svg class="tab-spinner" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="10" cy="10" r="7" stroke-opacity="0.25"/>
  <path stroke-linecap="round" d="M10 3a7 7 0 017 7"/>
</svg>`

function makeFaviconEl(favicon, isLoading) {
  if (isLoading) return SPINNER_SVG
  if (favicon)   return `<img src="${favicon}" width="16" height="16" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
  return GLOBE_SVG
}

// ─── Tab elements ─────────────────────────────────────────────────────────────

function createTabEl(data) {
  const el = document.createElement('div')
  el.className = 'tab' + (data.isActive ? ' active' : '')
  el.dataset.tabId = data.id
  el.title = data.title || 'New Tab'

  el.innerHTML = `
    <div class="tab-icon">${makeFaviconEl(data.favicon, data.isLoading)}</div>
    <span class="tab-title">${escHtml(data.title || 'New Tab')}</span>
    <button class="tab-close" title="Close tab" aria-label="Close tab">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="1" y1="1" x2="11" y2="11"/>
        <line x1="11" y1="1" x2="1" y2="11"/>
      </svg>
    </button>`

  el.addEventListener('click', () => { if (activeTabId !== data.id) window.litzium.switchTab(data.id) })
  el.addEventListener('auxclick', e => { if (e.button === 1 && !data.pinned) window.litzium.closeTab(data.id) })
  el.addEventListener('contextmenu', e => showTabCtxMenu(e, data.id, !!data.pinned))
  el.querySelector('.tab-close').addEventListener('click', e => {
    e.stopPropagation()
    window.litzium.closeTab(data.id)
  })

  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.tab-close')) return
    if (tabStore.get(data.id)?.data.pinned) return
    startDrag(data.id, e.pointerId, e.clientX)
  })
  el.addEventListener('pointermove', e => {
    if (dragTabId === data.id) updateDragIndicator(e.clientX)
  })
  el.addEventListener('pointerup', e => {
    if (dragTabId === data.id) commitDrag(e.clientX)
  })
  el.addEventListener('pointercancel', () => {
    if (dragTabId === data.id) cancelDrag()
  })

  tabStore.set(data.id, { el, data: { ...data } })
  tabsContainer.appendChild(el)
  return el
}

function updateTabEl(id, patch) {
  const entry = tabStore.get(id)
  if (!entry) return
  Object.assign(entry.data, patch)
  const { el, data } = entry

  if (patch.title !== undefined) {
    el.querySelector('.tab-title').textContent = data.title || 'New Tab'
    el.title = data.title || 'New Tab'
  }
  if (patch.favicon !== undefined || patch.isLoading !== undefined) {
    el.querySelector('.tab-icon').innerHTML = makeFaviconEl(data.favicon, data.isLoading)
  }
  if (patch.pinned !== undefined) {
    el.classList.toggle('pinned', data.pinned)
  }
}

function removeTabEl(id) {
  const entry = tabStore.get(id)
  if (!entry) return
  entry.el.remove()
  tabStore.delete(id)
}

function setActiveTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  const entry = tabStore.get(id)
  if (entry) {
    entry.el.classList.add('active')
    activeTabId = id
    entry.el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

// ─── IPC event handlers ───────────────────────────────────────────────────────

const ch = window.litzium.channels

window.litzium.on(ch.TAB_CREATED, data => {
  createTabEl(data)
  if (data.isActive) setActiveTab(data.id)
  rebuildGroupLabels()
})

window.litzium.on(ch.TAB_CLOSED, ({ id }) => {
  tabGroupMap.delete(id)
  removeTabEl(id)
  rebuildGroupLabels()
})

window.litzium.on(ch.TAB_UPDATED, data => updateTabEl(data.id, data))

window.litzium.on(ch.TAB_SWITCHED, ({ id }) => setActiveTab(id))

window.litzium.on(ch.NAV_STATE, state => {
  if (document.activeElement !== addressBar) {
    addressBar.value = (state.url === 'litzium://newtab' || !state.url) ? '' : state.url
  }
  setPageIcon(state.url, state.favicon, state.isLoading)
  backBtn.disabled    = !state.canGoBack
  forwardBtn.disabled = !state.canGoForward

  if (state.isLoading) {
    icoReload.style.display = 'none'
    icoStop.style.display   = ''
    reloadBtn.title = 'Stop loading (Esc)'
    startProgress()
  } else {
    icoReload.style.display = ''
    icoStop.style.display   = 'none'
    reloadBtn.title = 'Reload (Ctrl+R)'
    endProgress()
  }

  // Update bookmark star (hide for internal/new-tab pages)
  const isInternal = !state.url || state.url.startsWith('litzium://') || state.url.startsWith('file://')
  if (isInternal) {
    starBtn.classList.add('internal')
  } else {
    starBtn.classList.remove('internal')
    window.litzium.isBookmarked(state.url).then(setStarState)
  }
})

window.litzium.on(ch.FOCUS_OMNIBOX, () => focusOmnibox())

// Print requests forwarded from web content keyboard shortcuts
window.litzium.on(ch.PRINT,        () => window.litzium.openPrintPreview())
window.litzium.on(ch.PRINT_TO_PDF, () => window.litzium.printToPDF())

window.litzium.on(ch.BOOKMARK_STATE, ({ isBookmarked }) => setStarState(isBookmarked))

// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme ?? 'dark')
}

window.litzium.on(ch.THEME_APPLY, applyTheme)

// ─── Session restore banner ───────────────────────────────────────────────────

window.litzium.on(ch.SESSION_AVAILABLE, ({ count }) => {
  sessionBanner.querySelector('.session-banner-text').textContent =
    `You had ${count} tab${count === 1 ? '' : 's'} open from your last session.`
  sessionBanner.hidden = false
  browserChrome.style.height = ''  // let it grow naturally
})

sessionRestoreBtn.addEventListener('click', () => {
  window.litzium.restoreSession()
  sessionBanner.hidden = true
})

sessionDismissBtn.addEventListener('click', () => {
  window.litzium.dismissSession()
  sessionBanner.hidden = true
})

// ─── Tab context menu ─────────────────────────────────────────────────────────

function hideTabCtxMenu() {
  tabCtxMenu.style.display = 'none'
  tabCtxMenu.innerHTML = ''
}

document.addEventListener('click', hideTabCtxMenu)
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTabCtxMenu() })

function showTabCtxMenu(e, tabId, isPinned) {
  e.preventDefault()
  e.stopPropagation()
  hideTabCtxMenu()

  const currentGroupId = tabGroupMap.get(tabId)
  const groupItems = []

  if (currentGroupId) {
    groupItems.push({ label: 'Remove from Group', action: () => removeFromGroup(tabId) })
  } else {
    groupItems.push({ label: 'New Group',         action: () => { const gid = createGroup(`Group ${groupCounter + 1}`); assignGroup(tabId, gid) } })
    if (groupMeta.size > 0) {
      for (const [gid, meta] of groupMeta) {
        groupItems.push({ label: `Add to "${meta.name}"`, action: () => assignGroup(tabId, gid) })
      }
    }
  }

  const items = [
    { label: isPinned ? 'Unpin Tab' : 'Pin Tab', action: () => isPinned ? window.litzium.unpinTab(tabId) : window.litzium.pinTab(tabId) },
    { sep: true },
    { label: 'New Tab',    action: () => window.litzium.newTab() },
    { label: 'Reload Tab', action: () => window.litzium.reload() },
    { sep: true },
    ...groupItems,
    { sep: true },
    { label: 'Close Tab',  action: () => window.litzium.closeTab(tabId), danger: true },
  ]

  items.forEach(item => {
    if (item.sep) {
      const div = document.createElement('div')
      div.className = 'ctx-separator'
      tabCtxMenu.appendChild(div)
    } else {
      const div = document.createElement('div')
      div.className = 'ctx-item' + (item.danger ? ' danger' : '')
      div.textContent = item.label
      div.addEventListener('click', () => { item.action(); hideTabCtxMenu() })
      tabCtxMenu.appendChild(div)
    }
  })

  tabCtxMenu.style.display = 'block'
  const x = Math.min(e.clientX, window.innerWidth  - 170)
  const y = Math.min(e.clientY, window.innerHeight - tabCtxMenu.offsetHeight - 8)
  tabCtxMenu.style.left = x + 'px'
  tabCtxMenu.style.top  = y + 'px'
}

// ─── Download shelf ───────────────────────────────────────────────────────────

const shelfMap = new Map()  // id → { record, el }
let   shelfDoneTimer = null

function renderShelfItem(record) {
  const { id, filename, received, total, state } = record
  const pct   = total > 0 ? Math.round((received / total) * 100) : 0
  const isDone = state === 'completed'

  let entry = shelfMap.get(id)
  if (!entry) {
    const el = document.createElement('div')
    el.className = 'shelf-item'
    el.id = 'shelf-' + id
    shelfItems.appendChild(el)
    entry = { record, el }
    shelfMap.set(id, entry)
  }

  entry.record = record
  entry.el.innerHTML = `
    <span class="shelf-item-name" title="${escHtml(filename)}">${escHtml(filename)}</span>
    ${isDone
      ? `<div class="shelf-item-progress"><div class="shelf-item-bar done" style="width:100%"></div></div>
         <button class="shelf-item-action" data-id="${id}" data-action="open">Open</button>`
      : `<div class="shelf-item-progress"><div class="shelf-item-bar" style="width:${pct}%"></div></div>
         <span style="font-size:11px;color:var(--text-secondary)">${pct}%</span>`
    }`

  entry.el.querySelector('[data-action="open"]')?.addEventListener('click', () => {
    window.litzium.navigate('litzium://downloads')
  })
}

function openShelf() {
  if (downloadShelf.hidden) {
    downloadShelf.hidden = false
    window.litzium.openShelf(SHELF_H)
  }
}

function scheduleShelfClose() {
  clearTimeout(shelfDoneTimer)
  shelfDoneTimer = setTimeout(() => {
    downloadShelf.hidden = true
    shelfItems.innerHTML = ''
    shelfMap.clear()
    window.litzium.closeShelf()
  }, 5000)
}

window.litzium.on(ch.DOWNLOAD_STARTED, record => {
  openShelf()
  clearTimeout(shelfDoneTimer)
  renderShelfItem(record)
})

window.litzium.on(ch.DOWNLOAD_UPDATED, ({ id, state, received, total }) => {
  const entry = shelfMap.get(id)
  if (!entry) return
  entry.record = { ...entry.record, state, received, total }
  renderShelfItem(entry.record)
})

window.litzium.on(ch.DOWNLOAD_DONE, ({ id, state, savePath }) => {
  const entry = shelfMap.get(id)
  if (entry) {
    entry.record = { ...entry.record, state, savePath }
    renderShelfItem(entry.record)
  }
  // Close shelf 5s after all downloads are done
  const allDone = [...shelfMap.values()].every(e => e.record.state !== 'progressing')
  if (allDone) scheduleShelfClose()
})

shelfClose.addEventListener('click', () => {
  clearTimeout(shelfDoneTimer)
  downloadShelf.hidden = true
  shelfItems.innerHTML = ''
  shelfMap.clear()
  window.litzium.closeShelf()
})

// ─── Sidebar ──────────────────────────────────────────────────────────────────

let sidebarOpen       = false
let sidebarActivePanel = 'bookmarks'

function toggleSidebar() {
  sidebarOpen ? closeSidebarPanel() : openSidebarPanel()
}

function openSidebarPanel() {
  sidebarOpen = true
  sidebar.hidden = false
  sidebarBtn.setAttribute('aria-pressed', 'true')
  window.litzium.openSidebar()
  loadSidebarPanel(sidebarActivePanel)
  setTimeout(() => sidebarSearch.focus(), 50)
}

function closeSidebarPanel() {
  sidebarOpen = false
  sidebar.hidden = true
  sidebarBtn.setAttribute('aria-pressed', 'false')
  window.litzium.closeSidebar()
}

sidebarCloseBtn.addEventListener('click', closeSidebarPanel)

// Tab switching
sidebar.querySelectorAll('.sidebar-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.dataset.panel
    sidebar.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    sidebarActivePanel = panel
    sidebarPanelBm.hidden   = panel !== 'bookmarks'
    sidebarPanelHist.hidden = panel !== 'history'
    loadSidebarPanel(panel)
  })
})

// Search filter
sidebarSearch.addEventListener('input', () => {
  const q = sidebarSearch.value.toLowerCase()
  const panel = sidebarActivePanel === 'bookmarks' ? sidebarPanelBm : sidebarPanelHist
  panel.querySelectorAll('.sidebar-item').forEach(el => {
    const text = el.dataset.filter || ''
    el.style.display = text.includes(q) ? '' : 'none'
  })
})

async function loadSidebarPanel(panel) {
  if (panel === 'bookmarks') {
    sidebarPanelBm.innerHTML = '<div class="sidebar-empty">Loading…</div>'
    try {
      const items = await window.litzium.getBookmarks()
      renderSidebarBookmarks(items || [])
    } catch { sidebarPanelBm.innerHTML = '<div class="sidebar-empty">Could not load bookmarks.</div>' }
  } else {
    sidebarPanelHist.innerHTML = '<div class="sidebar-empty">Loading…</div>'
    try {
      const items = await window.litzium.getHistory()
      renderSidebarHistory((items || []).slice(0, 100))
    } catch { sidebarPanelHist.innerHTML = '<div class="sidebar-empty">Could not load history.</div>' }
  }
}

function renderSidebarBookmarks(bookmarks) {
  if (!bookmarks.length) {
    sidebarPanelBm.innerHTML = '<div class="sidebar-empty">No bookmarks yet.</div>'
    return
  }
  sidebarPanelBm.innerHTML = ''
  bookmarks.forEach(bm => {
    const domain = tryHostname(bm.url)
    const el = document.createElement('div')
    el.className = 'sidebar-item'
    el.dataset.filter = (bm.title + ' ' + bm.url).toLowerCase()
    el.innerHTML = `
      <img class="sidebar-item-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" alt="" onerror="this.style.display='none'">
      <span class="sidebar-item-text">${escHtml(bm.title || bm.url)}</span>
      <span class="sidebar-item-sub">${escHtml(domain)}</span>`
    el.addEventListener('click', () => window.litzium.navigate(bm.url))
    sidebarPanelBm.appendChild(el)
  })
}

function renderSidebarHistory(entries) {
  if (!entries.length) {
    sidebarPanelHist.innerHTML = '<div class="sidebar-empty">No history yet.</div>'
    return
  }
  sidebarPanelHist.innerHTML = ''
  entries.forEach(entry => {
    const domain = tryHostname(entry.url)
    const el = document.createElement('div')
    el.className = 'sidebar-item'
    el.dataset.filter = (entry.title + ' ' + entry.url).toLowerCase()
    el.innerHTML = `
      <img class="sidebar-item-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" alt="" onerror="this.style.display='none'">
      <span class="sidebar-item-text">${escHtml(entry.title || entry.url)}</span>
      <span class="sidebar-item-sub">${escHtml(domain)}</span>`
    el.addEventListener('click', () => window.litzium.navigate(entry.url))
    sidebarPanelHist.appendChild(el)
  })
}

function tryHostname(url) {
  try { return new URL(url).hostname } catch { return url }
}

// ─── Bookmark star ────────────────────────────────────────────────────────────

function setStarState(isBookmarked) {
  starBtn.setAttribute('aria-pressed', String(isBookmarked))
  icoStarEmpty.style.display  = isBookmarked ? 'none' : ''
  icoStarFilled.style.display = isBookmarked ? '' : 'none'
  starBtn.title = isBookmarked ? 'Remove bookmark' : 'Bookmark this page'
}

starBtn.addEventListener('click', async () => {
  const url   = addressBar.value || ''
  if (!url || url.startsWith('litzium://')) return
  const entry  = activeTabId ? tabStore.get(activeTabId) : null
  const result = await window.litzium.toggleBookmark(
    url,
    entry?.data.title ?? url,
    entry?.data.favicon ?? null,
  )
  setStarState(result.isBookmarked)
  // Brief pulse animation
  starBtn.style.transform = 'scale(1.3)'
  setTimeout(() => { starBtn.style.transform = '' }, 200)
})

// ─── Zoom pill ────────────────────────────────────────────────────────────────

let zoomHideTimer = null

window.litzium.on(ch.ZOOM_CHANGED, ({ zoomFactor }) => {
  const pct = Math.round(zoomFactor * 100)
  if (pct === 100) {
    clearTimeout(zoomHideTimer)
    zoomPill.hidden = true
    return
  }
  zoomLabel.textContent = pct + '%'
  zoomPill.hidden = false
  clearTimeout(zoomHideTimer)
  zoomHideTimer = setTimeout(() => { zoomPill.hidden = true }, 2500)
})

zoomPill.addEventListener('click', () => {
  window.litzium.resetZoom()
  zoomPill.hidden = true
  clearTimeout(zoomHideTimer)
})

// ─── Find bar ─────────────────────────────────────────────────────────────────

let findOpen    = false
let lastQuery   = ''

function openFindBar() {
  if (findOpen) { findInput.select(); return }
  findOpen = true
  findBar.hidden = false
  browserChrome.style.height = (BASE_CHROME_H + FIND_BAR_H) + 'px'
  window.litzium.openFindBar()
  findInput.focus()
  findInput.select()
}

function closeFindBar() {
  if (!findOpen) return
  findOpen = false
  findBar.hidden = true
  browserChrome.style.height = ''
  findCount.textContent = ''
  findCount.classList.remove('no-match')
  findInput.classList.remove('no-match')
  lastQuery = ''
  window.litzium.findStop()
  window.litzium.closeFindBar()
}

function runFind(forward = true) {
  const q = findInput.value
  if (!q) { findCount.textContent = ''; return }
  if (q !== lastQuery) {
    lastQuery = q
    window.litzium.findStart(q, forward)
  } else {
    window.litzium.findStart(q, forward)
  }
}

window.litzium.on(ch.FIND_RESULT, ({ activeMatchOrdinal, matches, finalUpdate }) => {
  if (!finalUpdate) return
  if (matches === 0) {
    findCount.textContent = 'No results'
    findCount.classList.add('no-match')
    findInput.classList.add('no-match')
  } else {
    findCount.textContent = `${activeMatchOrdinal} / ${matches}`
    findCount.classList.remove('no-match')
    findInput.classList.remove('no-match')
  }
})

// Main process asks chrome to open find bar (from Ctrl+F in web content)
window.litzium.on(ch.FIND_BAR_OPEN,  () => openFindBar())
window.litzium.on(ch.FIND_BAR_CLOSE, () => closeFindBar())

findInput.addEventListener('input', () => runFind(true))

findInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault()
    runFind(!e.shiftKey)
  } else if (e.key === 'Escape') {
    closeFindBar()
  }
})

findPrev.addEventListener('click',  () => runFind(false))
findNext.addEventListener('click',  () => runFind(true))
findClose.addEventListener('click', () => closeFindBar())

// ─── Download badge ───────────────────────────────────────────────────────────

let activeDownloads = 0
let doneTimer = null

function updateDownloadBadge() {
  if (activeDownloads > 0) {
    dlBtn.hidden = false
    dlBadge.textContent = String(activeDownloads)
    dlBadge.classList.remove('done')
  } else {
    // nothing
  }
}

window.litzium.on(ch.DOWNLOAD_STARTED, () => {
  clearTimeout(doneTimer)
  activeDownloads++
  dlBtn.hidden = false
  dlBadge.classList.remove('done')
  updateDownloadBadge()
})

window.litzium.on(ch.DOWNLOAD_UPDATED, () => updateDownloadBadge())

window.litzium.on(ch.DOWNLOAD_DONE, () => {
  activeDownloads = Math.max(0, activeDownloads - 1)
  if (activeDownloads === 0) {
    dlBadge.textContent = '✓'
    dlBadge.classList.add('done')
    doneTimer = setTimeout(() => {
      dlBtn.hidden = true
      dlBadge.textContent = ''
      dlBadge.classList.remove('done')
    }, 4000)
  } else {
    updateDownloadBadge()
  }
})

dlBtn.addEventListener('click', () => window.litzium.newTab('litzium://downloads'))

// ─── Omnibox ──────────────────────────────────────────────────────────────────

function focusOmnibox() {
  addressBar.focus()
  addressBar.select()
}

// ─── Suggestions dropdown ─────────────────────────────────────────────────────

// suggItems entries: { text, url, type: 'history'|'search' }
let suggItems     = []
let activeSuggIdx = -1
let originalInput = ''
let suggDebounce  = null

const ITEM_H       = 36
const ITEM_H_HIST  = 44
const SUGG_HIST    = 3   // max history hits
const SUGG_SEARCH  = 5   // max search hits (total ≤ 8)

const SEARCH_SVG = `<svg class="sugg-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
</svg>`

const HISTORY_SVG = `<svg class="sugg-icon sugg-icon-hist" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
</svg>`

const ARROW_SVG = `<svg class="sugg-arrow" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
</svg>`

function positionDropdown() {
  const rect = omnibox.getBoundingClientRect()
  suggestionsDropdown.style.left  = `${rect.left}px`
  suggestionsDropdown.style.width = `${rect.width}px`
  suggestionsDropdown.style.top   = `${rect.bottom - 1}px`
}

function boldMatch(text, query) {
  if (!query) return escHtml(text)
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return escHtml(text)
  return (
    escHtml(text.slice(0, idx)) +
    `<span class="sugg-match">${escHtml(text.slice(idx, idx + query.length))}</span>` +
    escHtml(text.slice(idx + query.length))
  )
}

function renderSuggestions(items, query) {
  suggestionsDropdown.innerHTML = ''
  items.forEach((item, i) => {
    const div = document.createElement('div')
    div.setAttribute('role', 'option')
    div.dataset.idx = i
    if (item.type === 'history') {
      div.className = 'sugg-item sugg-item-hist'
      const shortUrl = item.url.length > 60 ? item.url.slice(0, 60) + '…' : item.url
      div.innerHTML = `${HISTORY_SVG}<span class="sugg-body"><span class="sugg-title">${boldMatch(item.text, query)}</span><span class="sugg-url">${escHtml(shortUrl)}</span></span>${ARROW_SVG}`
    } else {
      div.className = 'sugg-item'
      div.innerHTML = `${SEARCH_SVG}<span style="flex:1;overflow:hidden;text-overflow:ellipsis">${boldMatch(item.text, query)}</span>${ARROW_SVG}`
    }
    div.addEventListener('mousedown', e => { e.preventDefault(); commitSuggestion(item) })
    div.addEventListener('mousemove', () => setActiveIdx(i, false))
    suggestionsDropdown.appendChild(div)
  })
}

function setActiveIdx(idx, updateInput = true) {
  const prev = suggestionsDropdown.querySelector('.sugg-item.active')
  if (prev) prev.classList.remove('active')
  activeSuggIdx = idx
  if (idx < 0 || idx >= suggItems.length) {
    if (updateInput) addressBar.value = originalInput
    return
  }
  const el = suggestionsDropdown.querySelector(`[data-idx="${idx}"]`)
  if (el) el.classList.add('active')
  if (updateInput) addressBar.value = suggItems[idx].url || suggItems[idx].text
}

function showDropdown(items, query) {
  if (!items.length) { hideDropdown(); return }
  suggItems     = items
  activeSuggIdx = -1
  originalInput = query
  renderSuggestions(items, query)
  positionDropdown()
  suggestionsDropdown.hidden = false
  const totalH = items.reduce((h, it) => h + (it.type === 'history' ? ITEM_H_HIST : ITEM_H), 2)
  window.litzium.expandOmnibox(totalH)
}

function hideDropdown() {
  if (suggestionsDropdown.hidden) return
  suggestionsDropdown.hidden = true
  suggestionsDropdown.innerHTML = ''
  suggItems     = []
  activeSuggIdx = -1
  window.litzium.collapseOmnibox()
}

function commitSuggestion(item) {
  const target = item.url || item.text
  addressBar.value = target
  hideDropdown()
  window.litzium.navigate(target)
  addressBar.blur()
}

addressBar.addEventListener('input', () => {
  clearTimeout(suggDebounce)
  const q = addressBar.value
  if (!q.trim() || q.startsWith('litzium://')) { hideDropdown(); return }
  suggDebounce = setTimeout(async () => {
    const [{ suggestions }, histEntries] = await Promise.all([
      window.litzium.getSuggestions(q),
      window.litzium.searchHistory(q, SUGG_HIST).catch(() => []),
    ])
    if (addressBar.value !== q) return

    const histItems = (histEntries || []).slice(0, SUGG_HIST).map(e => ({
      text: e.title || e.url, url: e.url, type: 'history',
    }))
    const histUrls  = new Set(histItems.map(h => h.url))
    const searchItems = suggestions
      .filter(s => !histUrls.has(s))
      .slice(0, SUGG_SEARCH)
      .map(s => ({ text: s, url: null, type: 'search' }))

    showDropdown([...histItems, ...searchItems], q)
  }, 200)
})

addressBar.addEventListener('focus', () => {
  originalInput = addressBar.value
  addressBar.select()
})

addressBar.addEventListener('keydown', e => {
  if (!suggestionsDropdown.hidden) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(Math.min(activeSuggIdx + 1, suggItems.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(activeSuggIdx <= 0 ? -1 : activeSuggIdx - 1); return }
    if (e.key === 'Tab')       { e.preventDefault(); if (activeSuggIdx >= 0) { const it = suggItems[activeSuggIdx]; addressBar.value = it.url || it.text; setActiveIdx(-1, false) }; return }
  }

  if (e.key === 'Enter') {
    clearTimeout(suggDebounce)
    const v = addressBar.value.trim()
    hideDropdown()
    if (v) window.litzium.navigate(v)
    addressBar.blur()
  } else if (e.key === 'Escape') {
    if (!suggestionsDropdown.hidden) {
      hideDropdown()
      addressBar.value = originalInput
    } else {
      addressBar.blur()
    }
  }
})

addressBar.addEventListener('blur', () => {
  setTimeout(hideDropdown, 120)
})

// ─── Page icon ────────────────────────────────────────────────────────────────

function setPageIcon(url, favicon, isLoading) {
  if (isLoading) {
    icoGlobe.style.display   = ''
    icoLock.style.display    = 'none'
    icoFavicon.style.display = 'none'
    return
  }
  if (favicon) {
    icoFavicon.src            = favicon
    icoFavicon.style.display  = ''
    icoGlobe.style.display    = 'none'
    icoLock.style.display     = 'none'
  } else if (url && url.startsWith('https://')) {
    icoLock.style.display     = ''
    icoGlobe.style.display    = 'none'
    icoFavicon.style.display  = 'none'
  } else {
    icoGlobe.style.display    = ''
    icoLock.style.display     = 'none'
    icoFavicon.style.display  = 'none'
  }
}

// ─── Nav buttons ──────────────────────────────────────────────────────────────

backBtn.addEventListener('click',    () => window.litzium.goBack())
forwardBtn.addEventListener('click', () => window.litzium.goForward())

reloadBtn.addEventListener('click', () => {
  const entry = activeTabId ? tabStore.get(activeTabId) : null
  entry?.data.isLoading ? window.litzium.stopLoading() : window.litzium.reload()
})

newTabBtn.addEventListener('click',   () => window.litzium.newTab())
devtoolsBtn.addEventListener('click', () => window.litzium.openDevTools())
settingsBtn.addEventListener('click',  () => window.litzium.navigate('litzium://settings'))
sidebarBtn.addEventListener('click',   () => toggleSidebar())

// ─── Progress bar ─────────────────────────────────────────────────────────────

let progressTimer = null

function startProgress() {
  clearTimeout(progressTimer)
  progressFill.style.transition = 'none'
  progressFill.style.width = '0%'
  progressFill.classList.add('indeterminate')
}

function endProgress() {
  progressFill.classList.remove('indeterminate')
  progressFill.style.transition = 'width 0.2s ease'
  progressFill.style.width = '100%'
  progressTimer = setTimeout(() => { progressFill.style.width = '0%' }, 350)
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey

  if      (ctrl && e.key === 't')                   { e.preventDefault(); window.litzium.newTab() }
  else if (ctrl && e.key === 'w')                   { e.preventDefault(); if (activeTabId) window.litzium.closeTab(activeTabId) }
  else if (ctrl && e.key === 'r')                   { e.preventDefault(); window.litzium.reload() }
  else if (ctrl && e.key === 'l')                   { e.preventDefault(); focusOmnibox() }
  else if (ctrl && e.key === 'f')                   { e.preventDefault(); openFindBar() }
  else if (ctrl && !e.shiftKey && e.key === 'p')   { e.preventDefault(); window.litzium.openPrintPreview() }
  else if (ctrl &&  e.shiftKey && e.key === 'P')   { e.preventDefault(); window.litzium.printToPDF() }
  else if (ctrl &&  e.shiftKey && e.key === 'T')   { e.preventDefault(); window.litzium.reopenLastTab() }
  else if (ctrl && !e.shiftKey && e.key === 'n')   { e.preventDefault(); window.litzium.newWindow() }
  else if (ctrl && !e.shiftKey && e.key === 'b')   { e.preventDefault(); toggleSidebar() }
  else if (e.altKey && e.key === 'ArrowLeft')       window.litzium.goBack()
  else if (e.altKey && e.key === 'ArrowRight')      window.litzium.goForward()
  else if (e.key === 'F5')                          { e.preventDefault(); window.litzium.reload() }
  else if (e.key === 'F12')                         window.litzium.openDevTools()
  else if (e.key === 'Escape' && !findOpen) {
    const entry = activeTabId ? tabStore.get(activeTabId) : null
    if (entry?.data.isLoading) window.litzium.stopLoading()
  }
  // Ctrl+1–9
  else if (ctrl && e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    const ids  = Array.from(tabStore.keys())
    const idx  = e.key === '9' ? ids.length - 1 : Number(e.key) - 1
    if (ids[idx]) window.litzium.switchTab(ids[idx])
  }
})

// ─── Util ─────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
