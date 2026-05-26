
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

// ─── Search ───────────────────────────────────────────────────────────────────

document.getElementById('nt-form').addEventListener('submit', e => {
  e.preventDefault()
  const q = document.getElementById('nt-input').value.trim()
  if (!q) return

  // Looks like a URL?
  if (/^(https?|file):\/\//i.test(q)) {
    window.location.href = q
  } else if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(\/.*)?$/.test(q)) {
    window.location.href = `https://${q}`
  } else {
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`
  }
})


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
