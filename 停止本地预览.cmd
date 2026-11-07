@echo off
chcp 65001 >nul
title Axiom 停止本地预览
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\stop-local-preview.ps1"
if errorlevel 1 pause
