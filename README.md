<div align="center">

# Litzium

**A modern, Chromium-based browser built on Electron**

[![Release](https://img.shields.io/github/v/release/owengaydosz/litzium?style=flat-square&color=7c83f7)](https://github.com/thelitzproject/litzium/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-7c83f7?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-7c83f7?style=flat-square)](#installation)
[![Electron](https://img.shields.io/badge/Electron-35.x-47848f?style=flat-square)](https://electronjs.org)

</div>

---

## What is Litzium?

Litzium is a desktop web browser built on top of **Electron** and **Chromium**. It uses Electron's `WebContentsView` API to manage independent tab instances, a custom frameless window with native Windows controls, and a suite of built-in `litzium://` pages for settings, history, bookmarks, and developer tooling.


## Installation

### Download the latest release

Head to [**Releases**](https://github.com/thelitzproject/litzium/releases/latest) and download the `Litzium-Setup-*.exe` installer for Windows.

> macOS and Linux builds are not yet published but can be compiled locally (see below).

---

## Building from source

**Requirements:** Node.js 18 LTS or later, npm 9+

```bash
# 1. Clone the repo
git clone https://github.com/thelitzproject/litzium.git
cd litzium

# 2. Install dependencies
npm install

# 3. Run in development mode
npm start
```

### Build a Windows installer

```bash
npm run build:win
# Output → dist/Litzium Setup <version>.exe
```

Or use the helper script:

```
build_win\build.bat
```

### Build for other platforms

```bash
npm run build:mac    # macOS .dmg
npm run build:linux  # Linux .AppImage
```

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+L` | Focus address bar |
| `Ctrl+R` / `F5` | Reload |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Alt+←` / `Alt+→` | Back / Forward |
| `Esc` | Stop loading |
| `F12` | Open DevTools |

---

## litzium:// pages

Type any of these directly into the address bar:

| URL | Description |
|---|---|
| `litzium://newtab` | New Tab page (clock, search, shortcuts) |
| `litzium://litz-urls` | Directory of all internal pages |
| `litzium://version` | Version and build information |
| `litzium://about` | About Litzium, license credits |
| `litzium://settings` | Browser preferences |
| `litzium://flags` | Experimental feature toggles |
| `litzium://debug` | Runtime diagnostics and feature support |
| `litzium://history` | Browsing history |
| `litzium://bookmarks` | Saved bookmarks |
| `litzium://downloads` | Download history |
| `litzium://predictions` | Live search autocomplete tester (dev) |


## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes
4. Open a pull request

Please keep PRs focused — one feature or fix per PR.

---

## License

MIT © 2026 The Litzium Foundation — see [LICENSE](LICENSE) for details.

Litzium is built on [Electron](https://electronjs.org) (MIT) and [Chromium](https://chromium.org) (BSD).
