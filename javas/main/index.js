const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const IPC = require('../../dbus/ipc')
const tabs = require('./tab-manager')
const CHROME_HEIGHT = 88 

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    frame: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // must be false so preload can require() modules
    },
  })

  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, '../../pages/browser.html'))

  win.once('ready-to-show', () => {
    win.show()
    tabs.init(win, CHROME_HEIGHT)
    tabs.createTab('litzium://newtab')
  })

  win.on('resize',     () => tabs.updateAllBounds())
  win.on('maximize',   () => { win.webContents.send(IPC.WIN_MAXIMIZED, true);  tabs.updateAllBounds() })
  win.on('unmaximize', () => { win.webContents.send(IPC.WIN_MAXIMIZED, false); tabs.updateAllBounds() })
}

function setupIPC() {
  ipcMain.on(IPC.WIN_MINIMIZE,  () => win?.minimize())
  ipcMain.on(IPC.WIN_MAXIMIZE,  () => win?.isMaximized() ? win.unmaximize() : win?.maximize())
  ipcMain.on(IPC.WIN_CLOSE,     () => win?.close())
  ipcMain.on(IPC.TAB_NEW,    (_, url)   => tabs.createTab(url))
  ipcMain.on(IPC.TAB_CLOSE,  (_, tabId) => tabs.closeTab(tabId))
  ipcMain.on(IPC.TAB_SWITCH, (_, tabId) => tabs.switchTab(tabId))
  ipcMain.on(IPC.NAV_GO,      (_, url) => tabs.navigate(url))
  ipcMain.on(IPC.NAV_BACK,    ()       => tabs.goBack())
  ipcMain.on(IPC.NAV_FORWARD, ()       => tabs.goForward())
  ipcMain.on(IPC.NAV_RELOAD,  ()       => tabs.reload())
  ipcMain.on(IPC.NAV_STOP,    ()       => tabs.stop())
  ipcMain.on(IPC.NAV_HOME,    ()       => tabs.navigate('litzium://newtab'))
  ipcMain.on(IPC.DEVTOOLS_OPEN, () => tabs.openDevTools())
}


app.whenReady().then(() => {
  createWindow()
  setupIPC()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
