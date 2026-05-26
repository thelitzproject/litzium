
const { shell } = require('electron')

/** @type {Map<string, DownloadRecord>} */
const downloads = new Map()
let nextId = 1

/** @typedef {{ id: string, filename: string, url: string, savePath: string, state: 'progressing'|'completed'|'cancelled'|'interrupted', received: number, total: number, startedAt: number }} DownloadRecord */

/**
 * Attach download tracking to an Electron session.
 * Call once during app startup: downloads.setup(session.defaultSession, mainWindow, IPC)
 *
 * @param {Electron.Session}      sess
 * @param {Electron.BrowserWindow} win  — used to push progress to the UI
 * @param {object}                IPC  — dbus/ipc constants
 */
function setup(sess, win, IPC) {
  sess.on('will-download', (event, item) => {
    const id = `dl-${nextId++}`

    const record = {
      id,
      filename:  item.getFilename(),
      url:       item.getURL(),
      savePath:  item.getSavePath() || '',
      state:     'progressing',
      received:  0,
      total:     item.getTotalBytes(),
      startedAt: Date.now(),
    }

    downloads.set(id, record)
    win.webContents.send(IPC.DOWNLOAD_STARTED, record)

    item.on('updated', (_, state) => {
      record.state    = state
      record.received = item.getReceivedBytes()
      record.total    = item.getTotalBytes()
      win.webContents.send(IPC.DOWNLOAD_UPDATED, {
        id,
        state,
        received: record.received,
        total:    record.total,
      })
    })

    item.once('done', (_, state) => {
      record.state    = state
      record.savePath = item.getSavePath()
      win.webContents.send(IPC.DOWNLOAD_DONE, { id, state, savePath: record.savePath })
    })
  })
}

function getAll()     { return Array.from(downloads.values()) }
function getById(id)  { return downloads.get(id) }
function clear()      { downloads.clear() }

/** Open the downloaded file in the OS. */
function openFile(id) {
  const dl = downloads.get(id)
  if (dl?.savePath) shell.openPath(dl.savePath)
}

/** Show the downloaded file in Explorer/Finder. */
function showInFolder(id) {
  const dl = downloads.get(id)
  if (dl?.savePath) shell.showItemInFolder(dl.savePath)
}

module.exports = { setup, getAll, getById, clear, openFile, showInFolder }
