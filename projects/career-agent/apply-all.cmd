@echo off
REM ===================================================================
REM  Double-click this to fill the WHOLE BATCH.
REM
REM  Opens one browser tab per opportunity, fills each one all the way
REM  through, and leaves every tab open for you to read.
REM
REM  It NEVER submits. Any control that says submit, send, apply for,
REM  finish or confirm is refused outright, and `npm test` proves that
REM  refusal fires rather than assuming it.
REM ===================================================================
cd /d "%~dp0"

set "PORT=9222"
set "EDGEPROFILE=%LOCALAPPDATA%\career-agent-edge"
set "EDGE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE (
  echo Could not find Microsoft Edge. Install it, or run:  npm run apply -- --all=8
  pause
  exit /b 1
)
echo Starting your Edge on port %PORT% (profile: %EDGEPROFILE%)
start "" "%EDGE%" --remote-debugging-port=%PORT% --user-data-dir="%EDGEPROFILE%" --no-first-run --no-default-browser-check about:blank
timeout /t 3 /nobreak >nul

call npm run apply -- --list
echo.
echo How many to fill in one go? Forty tabs is not a review, it is a mess.
set /p COUNT=Number, or just press Enter for 8:
if "%COUNT%"=="" set COUNT=8

call npm run apply -- --all=%COUNT% --attach=%PORT%
if errorlevel 1 (
  echo.
  echo Something failed above.
  echo   missing module          run:  npm ci
  echo   browser not found       run:  npx playwright install chromium
  echo   no CV in output\        run:  career-agent.cmd first
)

echo.
echo Every tab is open and filled. NOTHING HAS BEEN SUBMITTED.
echo Go tab by tab, read each one, fix what is wrong, and press submit yourself.
pause
