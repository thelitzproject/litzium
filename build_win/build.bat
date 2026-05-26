@echo off
:: ============================================================================
::  Builds the Litzium Windows installer via electron-builder.
::  Run from the project root: build_win\build.bat
:: ============================================================================

setlocal enabledelayedexpansion

echo.
echo  ==========================================
echo   Litzium — Windows Build
echo  ==========================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    exit /b 1
)

:: Check npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found.
    exit /b 1
)

:: Move to project root (one level up from build_win/)
cd /d "%~dp0.."
echo [INFO] Working directory: %CD%

:: Install dependencies
echo.
echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    exit /b 1
)

:: Run electron-builder for Windows
echo.
echo [2/3] Building Litzium for Windows (x64)...
call npm run build:win
if errorlevel 1 (
    echo [ERROR] Build failed.
    exit /b 1
)

echo.
echo [3/3] Done!
echo.
echo  Output: dist\
echo.

endlocal
