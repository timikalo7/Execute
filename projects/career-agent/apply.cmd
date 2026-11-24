@echo off
setlocal EnableDelayedExpansion
REM ===================================================================
REM  Double-click this to fill in ONE application.
REM
REM  It uses YOUR OWN Microsoft Edge, not an automated copy of it.
REM
REM  Why: `channel: "msedge"` already ran the real Edge binary and forms
REM  still refused it, because the binary was never the whole signal.
REM  Playwright launches it against a BLANK profile — no history, no
REM  extensions, no saved logins, no cookies older than a minute. A
REM  browser with a clean slate and one tab is not what a real person's
REM  browser looks like, and fingerprinting checks score all of that.
REM
REM  So this starts Edge with a real, persistent profile of your own and
REM  a debugging port, then attaches to it. Everything that makes a
REM  browser look used comes along, and it keeps improving: every login
REM  and every visit is still there next time.
REM
REM  It opens a browser, fills the form, and STOPS. It never submits.
REM  You read it, fix anything wrong, and press submit yourself.
REM ===================================================================
cd /d "%~dp0"

set "PORT=9222"
set "EDGEPROFILE=%LOCALAPPDATA%\career-agent-edge"

REM Find Edge. Both install locations, 64-bit first.
set "EDGE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE (
  echo Could not find Microsoft Edge in either Program Files location.
  echo Install Edge, or run:  npm run apply -- ^<slug^>
  pause
  exit /b 1
)

REM A SEPARATE profile directory, deliberately, and it is not a compromise.
REM Edge refuses --remote-debugging-port against the profile it is already
REM running, so pointing at your everyday one means closing every window
REM you have open first. This profile is yours, it persists, and it gets
REM more real every time you use it — the logins you do here stay done.
echo Starting your Edge on port %PORT% (profile: %EDGEPROFILE%)
start "" "%EDGE%" --remote-debugging-port=%PORT% --user-data-dir="%EDGEPROFILE%" --no-first-run --no-default-browser-check about:blank

REM Give it a moment to open the debugging port before we knock.
timeout /t 3 /nobreak >nul

call npm run apply -- --list
echo.
set /p SLUG=Paste the slug of the one you want, then press Enter:
if "%SLUG%"=="" (
  echo No slug given. Nothing done.
  pause
  exit /b 0
)

call npm run apply -- %SLUG% --attach=%PORT%
if errorlevel 1 (
  echo.
  echo If it said it could not attach, Edge did not start or the port is busy.
  echo Close every Edge window and run this again, or try a different port:
  echo    npm run apply -- %SLUG% --attach=9333
)
pause
