@echo off
rem Removes Timefill's files and update helper for your Windows user.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\uninstall.ps1"
pause
