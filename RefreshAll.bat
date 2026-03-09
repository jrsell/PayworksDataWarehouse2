@echo off

:: Change to the directory where the batch file is located
cd /d %~dp0

:: Create the logs directory if it doesn't exist
if not exist logs mkdir logs

:: Build the log file path
set "logFile=logs\Refresh-log.txt"

:: Start the Node.js refresh and redirect output to the log file
echo Refreshing...
echo Refresh started at %date% %time% > %logFile%

node src\loadAll.js >> %logFile% 2>&1
if errorlevel 1 goto :failed

echo Refresh completed successfully at %date% %time% >> %logFile%
echo Done. Output in: %logFile%
goto :eof

:failed
echo Refresh failed. See log: %logFile%
echo Refresh failed at %date% %time% >> %logFile%
exit /b 1