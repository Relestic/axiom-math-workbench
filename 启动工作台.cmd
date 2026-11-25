@echo off
setlocal
cd /d "%~dp0"
if exist "frontend\dist-portable\index.html" goto start
pushd frontend
call npm ci
if errorlevel 1 goto build_failed
node scripts\build-portable.mjs
if errorlevel 1 goto build_failed
popd
:start
python backend\portable_server.py
if errorlevel 1 pause
exit /b %errorlevel%
:build_failed
popd
echo The frontend build failed. Check the error above.
pause
exit /b 1
