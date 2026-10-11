@echo off
REM ============================================================
REM  CampusBiz Autopilot - one-click launcher (wrapper route)
REM  Starts: (1) workbuddy2api wrapper  :8787
REM          (2) bridge server          :3333
REM          (3) opens the dashboard
REM  Close the two spawned windows to stop everything.
REM ============================================================
setlocal

set WRAPPER_DIR=C:\Users\HP\workbuddy2api
set BRIDGE_DIR=C:\Users\HP\campusbiz-output
set PY=C:\Users\HP\.workbuddy-ai\binaries\python\versions\3.13.12\python.exe
set ELECTRON=C:\Users\HP\AppData\Local\Programs\WorkBuddyAI\WorkBuddyAI.exe

echo.
echo  CampusBiz Autopilot - starting...
echo.

REM --- sanity checks ---
if not exist "%WRAPPER_DIR%\core\converter.py" (
  echo  [X] Wrapper not found at %WRAPPER_DIR%
  echo      Re-clone workbuddy2api there first.
  pause & exit /b 1
)
if not exist "%BRIDGE_DIR%\bridge-server.js" (
  echo  [X] bridge-server.js not found at %BRIDGE_DIR%
  pause & exit /b 1
)
if not exist "%PY%" (
  echo  [X] Python not found at %PY%
  pause & exit /b 1
)

REM --- 1. wrapper (own window) ---
echo  [1/3] Starting wrapper on :8787 ...
start "CampusBiz Wrapper :8787" cmd /k "cd /d %WRAPPER_DIR% && set WORKBUDDY_BACKEND=https://www.workbuddy.ai && set WORKBUDDY_ELECTRON_PATH=%ELECTRON% && "%PY%" -c "import sys; sys.argv=['converter','--port','8787','--skip-check']; sys.path.insert(0,'.'); from core.converter import main; main()""

REM --- 2. bridge (own window) ---
echo  [2/3] Starting bridge on :3333 ...
start "CampusBiz Bridge :3333" cmd /k "cd /d %BRIDGE_DIR% && node bridge-server.js"

REM --- wait for health, up to ~40s ---
echo  [3/3] Waiting for both services to come up ...
set /a TRIES=0
:WAIT
timeout /t 2 /nobreak >nul
set /a TRIES+=1
node -e "const h=require('http');const r=h.get('http://127.0.0.1:8787/v1/models',s=>process.exit(s.statusCode===200?0:1));r.on('error',()=>process.exit(1));r.setTimeout(900,()=>{r.destroy();process.exit(1)});" >nul 2>&1
set WRAPPER_OK=%errorlevel%
node -e "const h=require('http');const r=h.get('http://127.0.0.1:3333/api/health',s=>process.exit(s.statusCode===200?0:1));r.on('error',()=>process.exit(1));r.setTimeout(900,()=>{r.destroy();process.exit(1)});" >nul 2>&1
set BRIDGE_OK=%errorlevel%
if %WRAPPER_OK%==0 if %BRIDGE_OK%==0 goto READY
if %TRIES% GEQ 20 goto TIMEOUT
goto WAIT

:READY
echo.
echo  ====================================================
echo    BOTH SERVICES ARE UP
echo      wrapper : http://127.0.0.1:8787/v1
echo      bridge  : http://127.0.0.1:3333
echo    Opening the dashboard...
echo  ====================================================
start "" "%BRIDGE_DIR%\campusbiz-live.html"
echo.
echo  The dashboard badge should read CONNECTED with mode = openai.
echo  Close the two spawned windows to stop everything.
echo.
pause
exit /b 0

:TIMEOUT
echo.
echo  [!] Services did not come up within ~40s.
echo      Check the two spawned windows for errors.
echo      Common causes: wrong Python path, port already in use.
echo.
pause
exit /b 1
