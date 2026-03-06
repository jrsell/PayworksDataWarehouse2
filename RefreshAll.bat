@echo off

:: Change to the directory where the batch file is located
cd /d %~dp0

:: Create the logs directory if it doesn't exist
if not exist logs mkdir logs

:: Build the log file path
set "logFile=logs\Refresh-log.txt"

:: Start the Node.js refresh and redirect output to the log file
echo Refreshing HBot Data...
echo Refresh started at %date% %time% > %logFile%

echo [1/4] Loading Employees...
echo [1/4] Loading Employees... >> %logFile%
node src\loadEmployees.js >> %logFile% 2>&1
if errorlevel 1 goto :failed

echo [2/4] Loading Departments...
echo [2/4] Loading Departments... >> %logFile%
node src\loadDepartments.js >> %logFile% 2>&1
if errorlevel 1 goto :failed

echo [3/4] Loading Shifts...
echo [3/4] Loading Shifts... >> %logFile%
node src\loadShifts.js >> %logFile% 2>&1
if errorlevel 1 goto :failed

echo [4/4] Loading TimeOffRequests...
echo [4/4] Loading TimeOffRequests... >> %logFile%
node src\loadTimeOffRequests.js >> %logFile% 2>&1
if errorlevel 1 goto :failed

echo [5/5] Loading PayworksLabourHours...
echo [5/5] Loading PayworksLabourHours... >> %logFile%
node src\loadPayworksLabourHours.js >> %logFile% 2>&1
if errorlevel 1 goto :failed

echo Refresh completed successfully at %date% %time% >> %logFile%
echo Done. Output in: %logFile%
goto :eof

:failed
echo Refresh failed. See log: %logFile%
echo Refresh failed at %date% %time% >> %logFile%
exit /b 1