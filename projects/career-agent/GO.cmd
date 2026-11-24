@echo off
setlocal EnableDelayedExpansion
REM ===================================================================
REM  ONE CLICK. This is the whole thing.
REM
REM   1. pulls the latest code
REM   2. finds today's opportunities and writes a tailored CV + full
REM      form pack for every one of them
REM   3. starts YOUR Edge, with your own persistent profile
REM   4. fills the applications, priority ones first
REM   5. leaves every tab open, filled, for you to read
REM
REM  It does not submit. That is the only thing it will not do, and it
REM  is deliberate: an application cannot be unsubmitted.
REM
REM  First run: log in to the sites in the Edge window it opens. Those
REM  logins are kept, so you only do it once.
REM ===================================================================
cd /d "%~dp0"

set "PORT=9222"
set "EDGEPROFILE=%LOCALAPPDATA%\career-agent-edge"
set "COUNT=%~1"
if "%COUNT%"=="" set "COUNT=6"

echo.
echo  [1/4] Updating...
git pull --ff-only || echo   (could not pull - carrying on with what is here)

echo.
echo  [2/4] Finding opportunities and writing documents...
call npm run daily
if errorlevel 1 (
  echo.
  echo  Failed. If it mentions a missing module:   npm ci
  echo  If it mentions a browser:                  npx playwright install chromium
  pause
  exit /b 1
)

echo.
echo  [3/3] Opening the queue and the dashboard...
start "" "COWORK-QUEUE.md"
start "" "dashboard.html"
echo.
echo  ============================================================
echo   Everything is written. Fill each form yourself, with
echo   apply.cmd, or with an assistant session on this PC: paste
echo   the COWORK.md for whichever row you are doing:
echo       output\^<slug^>\COWORK.md
echo.
echo   COWORK-QUEUE.md lists them, priority first, deadline order.
echo  ============================================================
pause
exit /b 0

REM ---- retired -------------------------------------------------
REM Kept for reference: the batch filler. apply.cmd and apply-all.cmd
REM run it on its own. A form that works on a saved fixture can still be
REM refused by a live site's bot check, so read every tab it fills.
echo  [x/x] Starting your Edge...
set "EDGE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE (
  echo  Could not find Microsoft Edge. Install it and run this again.
  pause
  exit /b 1
)
start "" "%EDGE%" --remote-debugging-port=%PORT% --user-data-dir="%EDGEPROFILE%" --no-first-run --no-default-browser-check about:blank
timeout /t 4 /nobreak >nul

echo.
echo  [4/4] Filling %COUNT% applications...
call npm run apply -- --all=%COUNT% --attach=%PORT%

echo.
echo  ============================================================
echo   Every tab is open and filled. NOTHING HAS BEEN SUBMITTED.
echo   Go tab by tab, read each one, and press submit yourself.
echo.
echo   Want more at once?   GO.cmd 12
echo  ============================================================
start "" "dashboard.html"
pause
