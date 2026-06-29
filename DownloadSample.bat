@echo off
:: ===========================================================================
:: DownloadSample.bat
:: Authenticates with Payworks and downloads Report 53 to
:: data\report-53-sample.json. Does NOT import anything into SQL Server.
:: Use it to verify that login + data download are working.
:: ===========================================================================

cd /d %~dp0

node src\downloadSample.js
if errorlevel 1 echo Sample download failed. Check the messages above.

echo.
pause
