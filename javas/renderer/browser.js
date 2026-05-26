
'use strict'
const tabStore = new Map()   // tabId → { el, data }
let activeTabId = null


const $ = id => document.getElementById(id)

const tabsContainer  = $('tabs-container')
const newTabBtn      = $('new-tab-btn')
const backBtn        = $('back-btn')
const forwardBtn     = $('forward-btn')
const reloadBtn      = $('reload-btn')
const icoReload      = $('ico-reload')
const icoStop        = $('ico-stop')
const devtoolsBtn    = $('devtools-btn')
const omnibox        = $('omnibox')
const addressBar     = $('address-bar')
const icoGlobe       = $('ico-globe')
const icoLock        = $('ico-lock')
const icoFavicon     = $('ico-favicon')
const progressFill   = $('progress-fill')
const winMinimize    = $('win-minimize')
const winMaximize    = $('win-maximize')
const winClose       = $('win-close')
const icoMaximize    = $('ico-maximize')
const icoRestore     = $('ico-restore')


winMinimize.addEventListener('click', () => window.litzium.minimizeWindow())
winMaximize.addEventListener('click', () => window.litzium.maximizeWindow())
winClose.addEventListener('click',    () => window.litzium.closeWindow())

window.litzium.on(window.litzium.channels.WIN_MAXIMIZED, (maximized) => {
  icoMaximize.style.display = maximized ? 'none' : ''
  icoRestore.style.display  = maximized ? '' : 'none'
  winMaximize.title = maximized ? 'Restore' : 'Maximize'
})


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
  el.addEventListener('auxclick', e => { if (e.button === 1) window.litzium.closeTab(data.id) })
  el.querySelector('.tab-close').addEventListener('click', e => {
    e.stopPropagation()
    window.litzium.closeTab(data.id)
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
    // Scroll active tab into view
    entry.el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}


const ch = window.litzium.channels

window.litzium.on(ch.TAB_CREATED, data => {
  createTabEl(data)
  if (data.isActive) setActiveTab(data.id)
})

window.litzium.on(ch.TAB_CLOSED, ({ id }) => removeTabEl(id))

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
})

window.litzium.on(ch.FOCUS_OMNIBOX, () => focusOmnibox())


function focusOmnibox() {
  addressBar.focus()
  addressBar.select()
}

// ─── Suggestions dropdown ─────────────────────────────────────────────────────

const suggestionsDropdown = $('suggestions-dropdown')
let suggItems      = []   // current suggestion strings
let activeSuggIdx  = -1   // keyboard-selected index (-1 = none)
let originalInput  = ''   // value before arrow-key navigation
let suggDebounce   = null

const ITEM_H      = 36   // px — must match CSS
const SUGG_LIMIT  = 8

const SEARCH_SVG = `<svg class="sugg-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
</svg>`

const ARROW_SVG = `<svg class="sugg-arrow" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
</svg>`

function positionDropdown() {
  const rect = omnibox.getBoundingClientRect()
  suggestionsDropdown.style.left  = `${rect.left}px`
  suggestionsDropdown.style.width = `${rect.width}px`
  suggestionsDropdown.style.top   = `${rect.bottom - 1}px`  // -1 to overlap omnibox bottom border
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
  items.forEach((text, i) => {
    const div = document.createElement('div')
    div.className = 'sugg-item'
    div.setAttribute('role', 'option')
    div.dataset.idx = i
    div.innerHTML = `${SEARCH_SVG}<span style="flex:1;overflow:hidden;text-overflow:ellipsis">${boldMatch(text, query)}</span>${ARROW_SVG}`

    div.addEventListener('mousedown', e => {
      e.preventDefault()          // prevent blur from firing first
      commitSuggestion(text)
    })
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
  if (updateInput) addressBar.value = suggItems[idx]
}

function showDropdown(items, query) {
  if (!items.length) { hideDropdown(); return }
  suggItems     = items
  activeSuggIdx = -1
  originalInput = query
  renderSuggestions(items, query)
  positionDropdown()
  suggestionsDropdown.hidden = false

  const dropH = items.length * ITEM_H
  window.litzium.expandOmnibox(dropH + 2)   // +2 for border
}

function hideDropdown() {
  if (suggestionsDropdown.hidden) return
  suggestionsDropdown.hidden = true
  suggestionsDropdown.innerHTML = ''
  suggItems     = []
  activeSuggIdx = -1
  window.litzium.collapseOmnibox()
}

function commitSuggestion(text) {
  addressBar.value = text
  hideDropdown()
  window.litzium.navigate(text)
  addressBar.blur()
}

// Debounced input handler
addressBar.addEventListener('input', () => {
  clearTimeout(suggDebounce)
  const q = addressBar.value
  if (!q.trim() || q.startsWith('litzium://')) { hideDropdown(); return }
  suggDebounce = setTimeout(async () => {
    const { suggestions } = await window.litzium.getSuggestions(q)
    // Guard: input may have changed during the async call
    if (addressBar.value !== q) return
    showDropdown(suggestions.slice(0, SUGG_LIMIT), q)
  }, 200)
})

addressBar.addEventListener('focus', () => {
  originalInput = addressBar.value
  addressBar.select()
})

addressBar.addEventListener('keydown', e => {
  if (!suggestionsDropdown.hidden) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(Math.min(activeSuggIdx + 1, suggItems.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(activeSuggIdx <= 0 ? -1 : activeSuggIdx - 1)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (activeSuggIdx >= 0 && activeSuggIdx < suggItems.length) {
        addressBar.value = suggItems[activeSuggIdx]
        setActiveIdx(-1, false)
      }
      return
    }
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
  // Small delay so mousedown on a suggestion fires first
  setTimeout(hideDropdown, 120)
})

function setPageIcon(url, favicon, isLoading) {
  if (isLoading) {
    icoGlobe.style.display  = ''
    icoLock.style.display   = 'none'
    icoFavicon.style.display = 'none'
    return
  }
  if (favicon) {
    icoFavicon.src           = favicon
    icoFavicon.style.display = ''
    icoGlobe.style.display   = 'none'
    icoLock.style.display    = 'none'
  } else if (url && url.startsWith('https://')) {
    icoLock.style.display    = ''
    icoGlobe.style.display   = 'none'
    icoFavicon.style.display = 'none'
  } else {
    icoGlobe.style.display   = ''
    icoLock.style.display    = 'none'
    icoFavicon.style.display = 'none'
  }
}


backBtn.addEventListener('click',    () => window.litzium.goBack())
forwardBtn.addEventListener('click', () => window.litzium.goForward())

reloadBtn.addEventListener('click', () => {
  const entry = activeTabId ? tabStore.get(activeTabId) : null
  entry?.data.isLoading ? window.litzium.stopLoading() : window.litzium.reload()
})

newTabBtn.addEventListener('click',    () => window.litzium.newTab())
devtoolsBtn.addEventListener('click',  () => window.litzium.openDevTools())


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


document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey

  if (ctrl && e.key === 't')        { e.preventDefault(); window.litzium.newTab() }
  else if (ctrl && e.key === 'w')   { e.preventDefault(); if (activeTabId) window.litzium.closeTab(activeTabId) }
  else if (ctrl && e.key === 'r')   { e.preventDefault(); window.litzium.reload() }
  else if (ctrl && e.key === 'l')   { e.preventDefault(); focusOmnibox() }
  else if (e.altKey && e.key === 'ArrowLeft')  window.litzium.goBack()
  else if (e.altKey && e.key === 'ArrowRight') window.litzium.goForward()
  else if (e.key === 'F5')          { e.preventDefault(); window.litzium.reload() }
  else if (e.key === 'F12')         window.litzium.openDevTools()
  else if (e.key === 'Escape') {
    const entry = activeTabId ? tabStore.get(activeTabId) : null
    if (entry?.data.isLoading) window.litzium.stopLoading()
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
