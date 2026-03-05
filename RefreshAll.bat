@echo off

:: Change to the directory where the batch file is located
cd /d %~dp0

:: Create the logs directory if it doesn't exist
if not exist logs mkdir logs

:: Build the log file path
set "logFile=logs\Refresh-log.txt"

:: Start the Node.js refesh and redirect output to the log file
echo Refreshing HBot Data...
node src\loadSchema.js > %logFile% 
echo Done. Output in: %logFile%