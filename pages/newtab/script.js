
'use strict'

// ─── Clock ────────────────────────────────────────────────────────────────────

const clockEl = document.getElementById('nt-clock')
const dateEl  = document.getElementById('nt-date')

let clockFormat = '24h'

function updateClock() {
  const now = new Date()
  const m   = String(now.getMinutes()).padStart(2, '0')
  let timeStr
  if (clockFormat === '12h') {
    let h    = now.getHours()
    const ap = h >= 12 ? ' PM' : ' AM'
    h        = h % 12 || 12
    timeStr  = `${String(h).padStart(2, '0')}:${m}${ap}`
  } else {
    timeStr = `${String(now.getHours()).padStart(2, '0')}:${m}`
  }
  clockEl.textContent = timeStr

  const opts = { weekday: 'long', month: 'long', day: 'numeric' }
  dateEl.textContent = now.toLocaleDateString(undefined, opts)
}

updateClock()
setInterval(updateClock, 1000)

// ─── Search navigation ────────────────────────────────────────────────────────

function navigateTo(q) {
  q = q.trim()
  if (!q) return
  if (/^(https?|file):\/\//i.test(q))                                         window.location.href = q
  else if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(\/.*)?$/.test(q))   window.location.href = `https://${q}`
  else                                                                          window.location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

document.getElementById('nt-form').addEventListener('submit', e => {
  e.preventDefault()
  const q = document.getElementById('nt-input').value.trim()
  ntHideDropdown()
  navigateTo(q)
})

// ─── Autocomplete ─────────────────────────────────────────────────────────────

const ntInput      = document.getElementById('nt-input')
const ntDropdown   = document.getElementById('nt-suggestions')
const NT_LIMIT     = 8
const NT_ITEM_H    = 38

let ntItems        = []
let ntActiveIdx    = -1
let ntOriginal     = ''
let ntDebounce     = null

// Only available when the page preload is injected (litzium://newtab)
const api = (typeof window.litzPagesAPI !== 'undefined') ? window.litzPagesAPI : null

const NT_SEARCH_SVG = `<svg class="nt-sugg-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
</svg>`

function ntBoldMatch(text, query) {
  if (!query) return escHtml(text)
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return escHtml(text)
  return (
    escHtml(text.slice(0, idx)) +
    `<strong>${escHtml(text.slice(idx, idx + query.length))}</strong>` +
    escHtml(text.slice(idx + query.length))
  )
}

function ntRender(items, query) {
  ntDropdown.innerHTML = ''
  items.forEach((text, i) => {
    const div = document.createElement('div')
    div.className = 'nt-sugg-item'
    div.setAttribute('role', 'option')
    div.dataset.idx = i
    div.innerHTML = `${NT_SEARCH_SVG}<span class="nt-sugg-text">${ntBoldMatch(text, query)}</span>`
    div.addEventListener('mousedown', e => { e.preventDefault(); ntCommit(text) })
    div.addEventListener('mousemove', () => ntSetActive(i, false))
    ntDropdown.appendChild(div)
  })
}

function ntSetActive(idx, updateInput = true) {
  ntDropdown.querySelectorAll('.nt-sugg-item').forEach(el => el.classList.remove('active'))
  ntActiveIdx = idx
  if (idx < 0) {
    if (updateInput) ntInput.value = ntOriginal
    return
  }
  const el = ntDropdown.querySelector(`[data-idx="${idx}"]`)
  if (el) el.classList.add('active')
  if (updateInput && ntItems[idx]) ntInput.value = ntItems[idx]
}

const ntSearchWrap = document.getElementById('nt-search-wrap')

function ntShowDropdown(items, query) {
  if (!items.length) { ntHideDropdown(); return }
  ntItems     = items
  ntActiveIdx = -1
  ntOriginal  = query
  ntRender(items, query)
  ntDropdown.hidden = false
  ntSearchWrap.classList.add('has-suggestions')
}

function ntHideDropdown() {
  ntDropdown.hidden = true
  ntDropdown.innerHTML = ''
  ntItems     = []
  ntActiveIdx = -1
  ntSearchWrap.classList.remove('has-suggestions')
}

function ntCommit(text) {
  ntInput.value = text
  ntHideDropdown()
  navigateTo(text)
}

if (api) {
  ntInput.addEventListener('input', () => {
    clearTimeout(ntDebounce)
    const q = ntInput.value
    if (!q.trim()) { ntHideDropdown(); return }
    ntDebounce = setTimeout(async () => {
      const { suggestions } = await api.getSuggestions(q)
      if (ntInput.value !== q) return          // stale response
      ntShowDropdown(suggestions.slice(0, NT_LIMIT), q)
    }, 200)
  })

  ntInput.addEventListener('keydown', e => {
    if (!ntDropdown.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); ntSetActive(Math.min(ntActiveIdx + 1, ntItems.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); ntSetActive(ntActiveIdx <= 0 ? -1 : ntActiveIdx - 1); return }
      if (e.key === 'Escape')    { e.preventDefault(); ntHideDropdown(); ntInput.value = ntOriginal; return }
    }
  })

  ntInput.addEventListener('blur', () => setTimeout(ntHideDropdown, 120))
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

const DEFAULT_SHORTCUTS = [
  { label: 'Google',    url: 'https://google.com',    icon: 'G' },
  { label: 'YouTube',   url: 'https://youtube.com',   icon: 'Y' },
  { label: 'GitHub',    url: 'https://github.com',    icon: '⌥' },
  { label: 'Wikipedia', url: 'https://wikipedia.org', icon: 'W' },
  { label: 'Reddit',    url: 'https://reddit.com',    icon: 'r' },
  { label: 'Twitter',   url: 'https://x.com',         icon: 'X' },
]

let shortcuts = DEFAULT_SHORTCUTS.slice()

function saveShortcuts() {
  if (api) api.setSetting('ntShortcuts', shortcuts)
}

function renderShortcuts() {
  const container = document.getElementById('nt-shortcuts')
  container.innerHTML = ''

  shortcuts.forEach((s, idx) => {
    const a = document.createElement('a')
    a.href      = s.url
    a.className = 'nt-shortcut'
    a.innerHTML = `
      <div class="nt-shortcut-icon">${escHtml(s.icon)}</div>
      <span class="nt-shortcut-label">${escHtml(s.label)}</span>
      <button class="nt-shortcut-remove" aria-label="Remove shortcut" tabindex="-1">×</button>`

    a.querySelector('.nt-shortcut-remove').addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      shortcuts.splice(idx, 1)
      saveShortcuts()
      renderShortcuts()
    })

    container.appendChild(a)
  })

  // "+" add tile
  const addTile = document.createElement('div')
  addTile.className = 'nt-shortcut nt-shortcut-add'
  addTile.setAttribute('role', 'button')
  addTile.setAttribute('tabindex', '0')
  addTile.innerHTML = `
    <div class="nt-shortcut-icon">+</div>
    <span class="nt-shortcut-label">Add</span>`
  addTile.addEventListener('click', openAddModal)
  addTile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAddModal() } })
  container.appendChild(addTile)
}

// ─── Add shortcut modal ───────────────────────────────────────────────────────

const modalOverlay = document.createElement('div')
modalOverlay.className = 'nt-modal-overlay'
modalOverlay.hidden = true
modalOverlay.innerHTML = `
  <div class="nt-modal">
    <div class="nt-modal-title">Add Shortcut</div>
    <div class="nt-modal-field">
      <label class="nt-modal-label" for="nt-modal-url">URL</label>
      <input class="nt-modal-input" id="nt-modal-url" type="text" placeholder="https://example.com" autocomplete="off" spellcheck="false">
    </div>
    <div class="nt-modal-field">
      <label class="nt-modal-label" for="nt-modal-name">Label</label>
      <input class="nt-modal-input" id="nt-modal-name" type="text" placeholder="Site name" autocomplete="off">
    </div>
    <div class="nt-modal-actions">
      <button class="nt-modal-btn" id="nt-modal-cancel">Cancel</button>
      <button class="nt-modal-btn primary" id="nt-modal-add">Add</button>
    </div>
  </div>`
document.body.appendChild(modalOverlay)

const modalUrlInput  = document.getElementById('nt-modal-url')
const modalNameInput = document.getElementById('nt-modal-name')

function openAddModal() {
  modalUrlInput.value  = ''
  modalNameInput.value = ''
  modalOverlay.hidden  = false
  modalUrlInput.focus()
}

function closeAddModal() {
  modalOverlay.hidden = true
}

function commitAdd() {
  let url   = modalUrlInput.value.trim()
  const name = modalNameInput.value.trim()
  if (!url) return
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  const hostname = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } })()
  const icon  = (name || hostname).charAt(0).toUpperCase()
  shortcuts.push({ label: name || hostname, url, icon })
  saveShortcuts()
  renderShortcuts()
  closeAddModal()
}

document.getElementById('nt-modal-cancel').addEventListener('click', closeAddModal)
document.getElementById('nt-modal-add').addEventListener('click', commitAdd)
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeAddModal() })
modalUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  { e.preventDefault(); modalNameInput.focus() }
  if (e.key === 'Escape') closeAddModal()
})
modalNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  { e.preventDefault(); commitAdd() }
  if (e.key === 'Escape') closeAddModal()
})

// ─── Utility ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Speed dial (most visited from history) ───────────────────────────────────

async function loadSpeedDial() {
  if (!api) return
  try {
    const allHistory = await api.getHistory()
    if (!allHistory || allHistory.length === 0) return

    // Aggregate visit counts per domain
    const domainMap = new Map()
    for (const entry of allHistory) {
      let hostname
      try { hostname = new URL(entry.url).hostname.replace(/^www\./, '') }
      catch { continue }
      if (!hostname) continue

      const existing = domainMap.get(hostname)
      if (existing) {
        existing.count++
        if (entry.visitedAt > existing.visitedAt) {
          existing.url   = entry.url
          existing.title = entry.title || hostname
        }
      } else {
        domainMap.set(hostname, {
          hostname,
          url:       entry.url,
          title:     entry.title || hostname,
          count:     1,
          visitedAt: entry.visitedAt ?? 0,
        })
      }
    }

    const topSites = [...domainMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    if (topSites.length === 0) return

    renderSpeedDial(topSites)
  } catch {}
}

function renderSpeedDial(sites) {
  const wrap = document.getElementById('nt-speed-dial')
  const grid = document.getElementById('nt-speed-dial-grid')
  grid.innerHTML = ''

  sites.forEach(site => {
    const item = document.createElement('a')
    item.href      = site.url
    item.className = 'nt-dial-item'
    item.title     = site.title

    const faviconSrc = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site.hostname)}&sz=48`
    item.innerHTML = `
      <div class="nt-dial-icon">
        <img src="${faviconSrc}" alt="" width="24" height="24"
          onerror="this.parentElement.innerHTML='<span class=\\'nt-dial-letter\\'>${escHtml(site.hostname.charAt(0).toUpperCase())}</span>'">
      </div>
      <span class="nt-dial-label">${escHtml(site.hostname)}</span>`
    grid.appendChild(item)
  })

  wrap.hidden = false
}

// ─── Init ─────────────────────────────────────────────────────────────────────
;(async () => {
  if (api) {
    const s = await api.getSettings()
    if (s.clockFormat) {
      clockFormat = s.clockFormat
      updateClock()
    }
    if (Array.isArray(s.ntShortcuts) && s.ntShortcuts.length) {
      shortcuts = s.ntShortcuts
    }
  }
  renderShortcuts()
  loadSpeedDial()
})()
