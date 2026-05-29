
const IPC = {
  WIN_MINIMIZE:  'window-minimize',
  WIN_MAXIMIZE:  'window-maximize',
  WIN_CLOSE:     'window-close',
  WIN_MAXIMIZED: 'window-maximized', // main → renderer

  TAB_NEW:    'new-tab',
  TAB_CLOSE:  'close-tab',
  TAB_SWITCH: 'switch-tab',
  TAB_CREATED:  'tab-created',
  TAB_CLOSED:   'tab-closed',
  TAB_UPDATED:  'tab-updated',
  TAB_SWITCHED: 'tab-switched',

  NAV_GO:       'navigate',
  NAV_BACK:     'go-back',
  NAV_FORWARD:  'go-forward',
  NAV_RELOAD:   'reload',
  NAV_STOP:     'stop-loading',
  NAV_HOME:     'go-home',
  NAV_STATE:    'nav-state',

  FOCUS_OMNIBOX: 'focus-address-bar',
  DEVTOOLS_OPEN: 'open-devtools',

  // ── Autocomplete / suggestions ───────────────────────────────────────────
  SUGGESTIONS_GET:  'suggestions-get',   // invoke → { suggestions, latencyMs }
  OMNIBOX_EXPAND:   'omnibox-expand',    // send { height }
  OMNIBOX_COLLAPSE: 'omnibox-collapse',

  // ── History ──────────────────────────────────────────────────────────────
  HISTORY_GET:    'history-get',     // invoke → HistoryEntry[]
  HISTORY_REMOVE: 'history-remove',  // invoke { id }
  HISTORY_CLEAR:  'history-clear',   // send

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  BOOKMARK_GET_ALL: 'bookmark-get-all',  // invoke → Bookmark[]
  BOOKMARK_TOGGLE:  'bookmark-toggle',   // invoke { url, title, favicon } → { isBookmarked, bookmark? }
  BOOKMARK_IS:      'bookmark-is',       // invoke { url } → boolean
  BOOKMARK_REMOVE:  'bookmark-remove',   // invoke { id }
  BOOKMARK_STATE:   'bookmark-state',    // main→renderer: { url, isBookmarked }

  // ── Downloads ────────────────────────────────────────────────────────────
  DOWNLOAD_GET_ALL: 'download-get-all',  // invoke → DownloadRecord[]
  DOWNLOAD_OPEN:    'download-open',     // send { id }
  DOWNLOAD_SHOW:    'download-show',     // send { id }
  DOWNLOAD_CLEAR:   'download-clear',    // send
  DOWNLOAD_STARTED: 'download-started',  // main→renderer: DownloadRecord
  DOWNLOAD_UPDATED: 'download-updated',  // main→renderer: { id, state, received, total }
  DOWNLOAD_DONE:    'download-done',     // main→renderer: { id, state, savePath }

  // ── Settings ──────────────────────────────────────────────────────────────
  SETTINGS_GET_ALL: 'settings-get-all',  // invoke → Settings object
  SETTINGS_SET:     'settings-set',      // send { key, value }

  // ── Find in page ─────────────────────────────────────────────────────────
  FIND_START:      'find-start',       // send { text, forward? }
  FIND_STOP:       'find-stop',        // send
  FIND_RESULT:     'find-result',      // main→renderer: { activeMatchOrdinal, matches, finalUpdate }
  FIND_BAR_OPEN:   'find-bar-open',    // send — push WebContentsView down for find bar
  FIND_BAR_CLOSE:  'find-bar-close',   // send

  // ── Zoom ──────────────────────────────────────────────────────────────────
  ZOOM_CHANGED: 'zoom-changed',  // main→renderer: { tabId, zoomFactor }
  ZOOM_RESET:   'zoom-reset',    // send

  // ── Print ─────────────────────────────────────────────────────────────────
  PRINT:         'print',          // send — open OS print dialog
  PRINT_TO_PDF:  'print-to-pdf',   // send — save PDF with dialog
  PRINT_RESULT:  'print-result',   // main→renderer: { success, filePath? }

  // ── Print preview (litzium://print-preview) ────────────────────────────
  PRINT_PREVIEW_OPEN:     'print-preview-open',     // send — open preview tab for active tab
  PRINT_PREVIEW_GENERATE: 'print-preview-generate', // invoke { opts } → { success, data: base64 }
  PRINT_PREVIEW_PRINT:    'print-preview-print',    // invoke { opts } → { success }
  PRINT_PREVIEW_SAVE:     'print-preview-save',     // invoke { opts } → { saved, filePath? }

  // ── Theme ─────────────────────────────────────────────────────────────────
  THEME_APPLY: 'theme-apply',  // main→chrome: string 'dark'|'light'|'system'

  // ── Reopen last closed tab ────────────────────────────────────────────────
  TAB_REOPEN_LAST: 'tab-reopen-last',  // send

  // ── Pinned tabs ───────────────────────────────────────────────────────────
  TAB_PIN:   'tab-pin',    // send { tabId }
  TAB_UNPIN: 'tab-unpin',  // send { tabId }

  // ── Session restore ───────────────────────────────────────────────────────
  SESSION_AVAILABLE: 'session-available',  // main→chrome: { count }
  SESSION_RESTORE:   'session-restore',    // send
  SESSION_DISMISS:   'session-dismiss',    // send

  // ── Download shelf ────────────────────────────────────────────────────────
  SHELF_OPEN:  'shelf-open',   // send { height } — chrome tells main shelf appeared
  SHELF_CLOSE: 'shelf-close',  // send             — chrome tells main shelf gone
}

module.exports = IPC
