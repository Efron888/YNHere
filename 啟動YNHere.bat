@echo off
cd /d "%~dp0"
echo ===================================================
echo   Starting YNHere Business Card Manager...
echo ===================================================
echo.
echo Opening browser: http://localhost:5173
start http://localhost:5173
echo.
echo Starting development server...
call npm run dev -- --host
pause
