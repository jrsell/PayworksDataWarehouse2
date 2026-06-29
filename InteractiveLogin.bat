@echo off
:: ===========================================================================
:: InteractiveLogin.bat
:: One-time setup for the NEW email login: opens a browser to log into
:: Payworks and complete the SMS 2FA. After this, headless logins
:: (DownloadSample / RefreshEmployees / RefreshAll) run with no 2FA prompt.
:: Not needed for the legacy login (PAYWORKS_CUSTOMER set in .env).
:: ===========================================================================

cd /d %~dp0

echo A browser window will open. Complete the SMS 2FA in it and enable
echo "remember this device", then wait for it to finish.
echo.

node src\interactive-login.js

echo.
pause
