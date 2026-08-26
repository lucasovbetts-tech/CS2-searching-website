@echo off
REM Run by Task Scheduler. Logs to sync.log next to this file.
cd /d "%~dp0"
echo. >> sync.log
echo ===== items %DATE% %TIME% ===== >> sync.log
"C:\Program Files\nodejs\node.exe" sync-item-prices.js >> sync.log 2>&1
