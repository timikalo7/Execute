@echo off
REM ===================================================================
REM  Double-click this to refresh the board.
REM
REM  Pulls the latest code, finds today's opportunities, writes a
REM  tailored CV and a full form pack for each, and opens the dashboard.
REM  Nothing here contacts an employer. It only writes files.
REM ===================================================================
cd /d "%~dp0"

echo Updating...
git pull --ff-only || echo (could not pull - carrying on with what is here)

echo.
echo Finding opportunities and writing documents...
call npm run daily
if errorlevel 1 (
  echo.
  echo Something failed above. If it mentions a missing module, run:  npm ci
  echo If it mentions a browser, run:  npx playwright install chromium
  pause
  exit /b 1
)

echo.
start "" "dashboard.html"
echo Dashboard opened. To apply to something, double-click apply.cmd
pause
