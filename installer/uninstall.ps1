# Timefill - Jira hours from your Outlook calendar.
# Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
# SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
#
# Removes what the Timefill installer set up for the current Windows user: the update helper registration and the
# %LOCALAPPDATA%\Timefill folder. Remove the extension in the browser yourself (chrome://extensions -> Remove).
# Nothing is changed in Jira or Outlook.
param([string]$Root = (Join-Path $env:LOCALAPPDATA "Timefill"))
$ErrorActionPreference = "Stop"
foreach ($browser in @("Software\Google\Chrome", "Software\Microsoft\Edge")) {
  Remove-Item -Path "HKCU:\$browser\NativeMessagingHosts\com.timefill.updater" -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $Root) { Remove-Item -LiteralPath $Root -Recurse -Force }
Write-Host ""
Write-Host "  Timefill's files and update helper are removed." -ForegroundColor Green
Write-Host "  Last step: in chrome://extensions, press 'Remove' on the Timefill card." -ForegroundColor White
Write-Host ""
