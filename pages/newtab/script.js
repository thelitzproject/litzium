
'use strict'

// ─── Clock ────────────────────────────────────────────────────────────────────

const clockEl = document.getElementById('nt-clock')
const dateEl  = document.getElementById('nt-date')

function updateClock() {
  const now  = new Date()
  const h    = String(now.getHours()).padStart(2, '0')
  const m    = String(now.getMinutes()).padStart(2, '0')
  clockEl.textContent = `${h}:${m}`

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


const DEFAULT_SHORTCUTS = [
  { label: 'Google',    url: 'https://google.com',    icon: 'G' },
  { label: 'YouTube',   url: 'https://youtube.com',   icon: 'Y' },
  { label: 'GitHub',    url: 'https://github.com',    icon: '⌥' },
  { label: 'Wikipedia', url: 'https://wikipedia.org', icon: 'W' },
  { label: 'Reddit',    url: 'https://reddit.com',    icon: 'r' },
  { label: 'Twitter',   url: 'https://x.com',         icon: 'X' },
]

function renderShortcuts(shortcuts) {
  const container = document.getElementById('nt-shortcuts')
  container.innerHTML = ''

  shortcuts.forEach(s => {
    const a = document.createElement('a')
    a.href  = s.url
    a.className = 'nt-shortcut'
    a.innerHTML = `
      <div class="nt-shortcut-icon">${escHtml(s.icon)}</div>
      <span class="nt-shortcut-label">${escHtml(s.label)}</span>`
    container.appendChild(a)
  })
}

renderShortcuts(DEFAULT_SHORTCUTS)


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

loadSpeedDial()
