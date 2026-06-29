@echo off
:: ===========================================================================
:: RefreshEmployees.bat
:: Refreshes ONLY the Employees table: authenticates with Payworks, downloads
:: the employee data, and ingests it into SQL Server. (A subset of what
:: RefreshAll.bat does.)
:: ===========================================================================

cd /d %~dp0

node src\loadEmployees.js
if errorlevel 1 echo Employees refresh failed. See logs\Refresh-Log.txt for details.

echo.
pause
