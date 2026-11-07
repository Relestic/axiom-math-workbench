@echo off
chcp 65001 >nul
title Axiom - Full Demo (Backend + Frontend)
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Start the backend once manually to check your setup.
  pause
  exit /b 1
)

echo Starting Axiom backend in a new window...
start "Axiom Backend" cmd /k call "%~dp0启动后端.cmd"

echo Waiting for the backend health check...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 40;$i++){ try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2; if($r.status -eq 'ok'){ $ok=$true; break } } catch {}; Start-Sleep -Milliseconds 750 }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
  echo Backend did not become ready on port 8000.
  echo Check the Axiom Backend window for the error, then retry.
  pause
  exit /b 1
)

echo Backend is ready. Starting frontend...
start "Axiom Frontend" cmd /k call "%~dp0启动前端.cmd"
echo.
echo The frontend will open at http://127.0.0.1:5174/
echo Log in with demo@axiom.local / axiom-demo-2026
echo Close the two service windows to stop the demo.
timeout /t 8 >nul
