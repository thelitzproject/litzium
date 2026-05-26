/**
 * printing/print.js
 * Browser print module — wraps Electron's webContents.print() and printToPDF().
 *
 * Usage (main process):
 *   const print = require('../../printing/print')
 *   await print.printPage(webContents, win)
 *   await print.savePDF(webContents, win)
 */

const { dialog, app, shell } = require('electron')
const path = require('path')
const fs   = require('fs')

// ─── Print (native OS dialog) ─────────────────────────────────────────────────

/**
 * Open the native OS print dialog for the given WebContents.
 *
 * @param {Electron.WebContents} wc
 * @param {object}               [opts]
 * @param {boolean}              [opts.printBackground=true]
 * @param {boolean}              [opts.landscape=false]
 * @param {string}               [opts.pageSize='A4']
 * @param {boolean}              [opts.color=true]
 * @param {string}               [opts.marginType='default']  default|none|printableArea
 * @returns {Promise<{ success: boolean, failureReason?: string }>}
 */
function printPage(wc, opts = {}) {
  return new Promise(resolve => {
    wc.print(
      {
        silent:          false,
        printBackground: opts.printBackground ?? true,
        landscape:       opts.landscape       ?? false,
        pageSize:        opts.pageSize        ?? 'A4',
        color:           opts.color           ?? true,
        margins: { marginType: opts.marginType ?? 'default' },
      },
      (success, failureReason) => {
        if (!success) console.warn('[print] native print failed:', failureReason)
        resolve({ success, failureReason })
      }
    )
  })
}

// ─── Save as PDF ──────────────────────────────────────────────────────────────

/**
 * Show a save dialog, then export the WebContents as a PDF.
 *
 * @param {Electron.WebContents}   wc
 * @param {Electron.BrowserWindow} win
 * @param {object}                 [opts]
 * @param {boolean}                [opts.printBackground=true]
 * @param {boolean}                [opts.landscape=false]
 * @param {string}                 [opts.pageSize='A4']
 * @param {string}                 [opts.marginType='default']
 * @param {boolean}                [opts.openAfterSave=false]
 * @returns {Promise<{ saved: boolean, filePath?: string, error?: string }>}
 */
async function savePDF(wc, win, opts = {}) {
  // Derive a sensible default filename from the page title
  const rawTitle = await wc.executeJavaScript('document.title').catch(() => '')
  const safeName = (rawTitle || 'page')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  const defaultPath = path.join(
    app.getPath('downloads'),
    `${safeName}.pdf`,
  )

  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title:       'Save page as PDF',
    defaultPath,
    filters:     [{ name: 'PDF Document', extensions: ['pdf'] }],
    buttonLabel: 'Save PDF',
    properties:  ['createDirectory'],
  })

  if (canceled || !filePath) return { saved: false }

  try {
    const buf = await wc.printToPDF({
      printBackground:   opts.printBackground ?? true,
      landscape:         opts.landscape       ?? false,
      pageSize:          opts.pageSize        ?? 'A4',
      generateTaggedPDF: true,
      margins: { marginType: opts.marginType ?? 'default' },
    })

    fs.writeFileSync(filePath, buf)

    if (opts.openAfterSave) shell.openPath(filePath)

    return { saved: true, filePath }
  } catch (err) {
    console.warn('[print] PDF export failed:', err.message)
    return { saved: false, error: err.message }
  }
}

// ─── Quick PDF (no dialog, straight to Downloads) ─────────────────────────────

/**
 * Save a PDF silently to the Downloads folder without a save dialog.
 * Useful for automated / keyboard-triggered exports.
 *
 * @param {Electron.WebContents} wc
 * @param {object}               [opts]
 * @returns {Promise<{ saved: boolean, filePath?: string, error?: string }>}
 */
async function quickPDF(wc, opts = {}) {
  const rawTitle = await wc.executeJavaScript('document.title').catch(() => '')
  const safeName = (rawTitle || 'page')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  const filePath = path.join(app.getPath('downloads'), `${safeName}.pdf`)

  try {
    const buf = await wc.printToPDF({
      printBackground:   opts.printBackground ?? true,
      landscape:         opts.landscape       ?? false,
      pageSize:          opts.pageSize        ?? 'A4',
      generateTaggedPDF: true,
      margins: { marginType: opts.marginType ?? 'default' },
    })

    fs.writeFileSync(filePath, buf)
    return { saved: true, filePath }
  } catch (err) {
    console.warn('[print] quickPDF failed:', err.message)
    return { saved: false, error: err.message }
  }
}

module.exports = { printPage, savePDF, quickPDF }
