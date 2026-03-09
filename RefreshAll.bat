@echo off

:: Change to the directory where the batch file is located
cd /d %~dp0

:: Node handles all logging (console + logs\Refresh-Log.txt + SQL RefreshLog table)
node src\loadAll.js
if errorlevel 1 (
    echo.
    echo Refresh failed. See logs\Refresh-Log.txt for details.
    exit /b 1
)