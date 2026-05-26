/**
 * Slick is Litzium's auto-updater.
 * This thing is built on top of electron-updater (comes with electron-builder).
 *
 * Usage (in javas/main/index.js, after app is ready):
 *   const slick = require('../../slick/updater')
 *   slick.init(mainWindow)
 */

const { ipcMain, dialog } = require('electron')

// electron-updater is bundled by electron-builder at package time.
// In dev mode this module may not exist; we handle that gracefully.
let autoUpdater = null
try {
  autoUpdater = require('electron-updater').autoUpdater
} catch {
  console.log('[Slick] electron-updater not available — skipping auto-update.')
}

let win = null


function init(mainWindow) {
  win = mainWindow
  if (!autoUpdater) return

  autoUpdater.autoDownload          = false  // ask user first
  autoUpdater.autoInstallOnAppQuit  = true


  autoUpdater.on('checking-for-update', () => {
    toRenderer('update-checking')
  })

  autoUpdater.on('update-available', info => {
    toRenderer('update-available', info)
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update available',
      message: `Litzium ${info.version} is available.`,
      detail: 'Download it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate()
    })
  })

  autoUpdater.on('update-not-available', () => {
    toRenderer('update-not-available')
  })

  autoUpdater.on('download-progress', progress => {
    toRenderer('update-progress', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', info => {
    toRenderer('update-downloaded', info)
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update ready',
      message: 'Litzium has been updated.',
      detail: 'Restart to apply the update?',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', err => {
    toRenderer('update-error', { message: err.message })
    console.error('[Slick] Update error:', err)
  })
  ipcMain.on('check-for-updates', () => checkForUpdates())
}


function checkForUpdates() {
  if (!autoUpdater) return
  autoUpdater.checkForUpdates().catch(err => console.error('[Slick]', err))
}


function toRenderer(channel, data = {}) {
  if (win && !win.isDestroyed()) win.webContents.send(`slick-${channel}`, data)
}

module.exports = { init, checkForUpdates }
