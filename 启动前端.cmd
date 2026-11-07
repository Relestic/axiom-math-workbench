@echo off
setlocal
title Axiom - Math Learning Workbench
cd /d "%~dp0frontend"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12+ or 24 is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please check your Node.js installation.
  pause
  exit /b 1
)
set "AXIOM_INSTALL="
if not exist "node_modules\vite\bin\vite.js" set "AXIOM_INSTALL=1"
if not exist "node_modules\mathjs\package.json" set "AXIOM_INSTALL=1"
if not exist "node_modules\plotly.js-basic-dist-min\package.json" set "AXIOM_INSTALL=1"
if not exist "node_modules\zod\package.json" set "AXIOM_INSTALL=1"
if defined AXIOM_INSTALL (
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed. Please check your connection and try again.
    pause
    exit /b 1
  )
)
echo Starting Axiom at http://127.0.0.1:5174/
echo Keep this window open. Press Ctrl+C to stop.
call npm run dev -- --open
if errorlevel 1 (
  echo Startup failed. Check whether port 5174 is already in use.
  pause
)
