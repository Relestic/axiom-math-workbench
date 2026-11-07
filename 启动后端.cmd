@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
echo Axiom backend - local demo server
echo.

python -c "import flask, sqlalchemy, pydantic, jwt, httpx, sympy" >nul 2>&1
if errorlevel 1 (
  echo Missing Python dependencies.
  echo Required: Flask SQLAlchemy Pydantic PyJWT httpx SymPy python-dotenv
  echo Install them or use a Python environment that already provides them.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created backend\.env from .env.example. Review it before sharing.
)

python -m app.cli init
if errorlevel 1 (
  echo Database initialization failed.
  pause
  exit /b 1
)

python -m app.cli seed --demo
echo.
echo Open in browser:
echo   http://127.0.0.1:8000/demo       (click-through console)
echo   http://127.0.0.1:8000/api/docs   (API reference)
echo Admin: admin@axiom.local / axiom-admin-2026
echo Demo:  demo@axiom.local / axiom-demo-2026
echo Press Ctrl+C to stop.
echo.
python run.py
pause
