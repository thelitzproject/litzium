
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
  // renderer → main (invoke, returns { suggestions, latencyMs })
  SUGGESTIONS_GET:  'suggestions-get',
  // renderer → main (send): push WebContentsView down while dropdown is open
  OMNIBOX_EXPAND:   'omnibox-expand',
  // renderer → main (send): restore WebContentsView to default position
  OMNIBOX_COLLAPSE: 'omnibox-collapse',
}

module.exports = IPC
