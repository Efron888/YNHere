@echo off
cd /d "%~dp0"
echo ===================================================
echo   YNHere Business Card Manager is starting...
echo ===================================================
echo.
echo Opening browser: http://localhost:5173
start http://localhost:5173
echo Starting development server...
echo.
call npm run dev -- --host
pause
