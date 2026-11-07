@echo off
chcp 65001 >nul
title Axiom 本地预览
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-local-preview.ps1"
if errorlevel 1 (
  pause
) else (
  echo.
  echo Open http://127.0.0.1:8080/ in your browser.
  timeout /t 10 >nul
)
