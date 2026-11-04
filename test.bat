@echo off
cd /d "%~dp0"
echo ===================================================
echo   Running YNHere Unit Tests (Vitest)
echo ===================================================
echo.
call npm test
echo.
call npm run typecheck
echo.
echo All tests completed!
pause
