@echo off
setlocal
cd /d "%~dp0"
if /i "%~1"=="--rebuild" goto build
if not exist "frontend\dist-portable\phase2.ready" goto build
if exist "frontend\dist-portable\index.html" goto start
:build
pushd "frontend"
if exist "node_modules\typescript\bin\tsc" if exist "node_modules\vite\package.json" goto compile
call npm ci
if errorlevel 1 goto build_failed
:compile
node scripts\build-portable.mjs
if errorlevel 1 goto build_failed
popd
:start
python -B "backend\portable_server.py"
if errorlevel 1 goto start_failed
exit /b 0
:build_failed
popd
echo The frontend build failed. Check the error above.
pause
exit /b 1
:start_failed
echo Axiom could not start. Check the Python dependencies and port above.
pause
exit /b 1
