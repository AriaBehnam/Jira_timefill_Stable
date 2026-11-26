# Timefill - Jira hours from your Outlook calendar.
# Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
# SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
#
# Installs Timefill for the current Windows user (no administrator rights needed):
#   1. copies the extension to %LOCALAPPDATA%\Timefill\extension (a folder that doesn't move)
#   2. gives that copy Timefill's fixed identity, so updates and your settings stay together
#   3. sets up the update helper, so "Update" in Timefill works with one click
#   4. opens the browser's extensions page and copies the folder to the clipboard for "Load unpacked"
# Running it again repairs or refreshes the installation; your Timefill settings are kept.
param(
  [string]$Root = (Join-Path $env:LOCALAPPDATA "Timefill"),
  [ValidateSet("", "chrome", "edge", "both")]
  [string]$Browser = "",   # which browser to open; asked when both Chrome and Edge are installed
  [switch]$SkipRegistry,   # for testing: don't register the update helper
  [switch]$NoBrowser       # for testing: don't open the browser
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$HostName = "com.timefill.updater"
$ExtensionId = "bgfcdblnhcolbbkeebhpckdkpiojbfhp"   # Timefill's fixed identity (from the key in timefill-updater.ps1)

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }

Say ""
Say "  Timefill installer" "Cyan"
Say "  -------------------" "Cyan"

# 1) the extension files ---------------------------------------------------------------------------------------
$src = Join-Path (Split-Path -Parent $PSScriptRoot) "extension"
if (-not (Test-Path -LiteralPath (Join-Path $src "manifest.json"))) {
  throw "The 'extension' folder was not found next to the installer. Unzip the whole download, then run 'Install Timefill.cmd' again."
}
$version = ((Get-Content -LiteralPath (Join-Path $src "manifest.json") -Raw -Encoding UTF8) | ConvertFrom-Json).version
$ext = Join-Path $Root "extension"
$upd = Join-Path $Root "updater"
New-Item -ItemType Directory -Force -Path $ext, $upd | Out-Null
# replace the extension files (only inside Timefill's own folder)
Get-ChildItem -LiteralPath $ext -Recurse -File -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item -Path (Join-Path $src "*") -Destination $ext -Recurse -Force
Say "  [1/4] Timefill $version copied to $ext" "Green"

# 2) the fixed identity in the installed copy ------------------------------------------------------------------
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "timefill-updater.ps1") -Destination $upd -Force
$keyLine = (Select-String -LiteralPath (Join-Path $upd "timefill-updater.ps1") -Pattern '^\$Key\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
$manifest = Join-Path $ext "manifest.json"
$text = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8
if ($text -notmatch '"key"\s*:') {
  $text = $text -replace '^\s*\{', ("{`r`n  `"key`": `"" + $keyLine + "`",")
  [IO.File]::WriteAllText($manifest, $text, (New-Object Text.UTF8Encoding($false)))
}
Say "  [2/4] Timefill's identity set ($ExtensionId)" "Green"

# 3) the update helper ------------------------------------------------------------------------------------------
$cmd = Join-Path $upd "timefill-updater.cmd"
[IO.File]::WriteAllText($cmd, "@echo off`r`npowershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"%~dp0timefill-updater.ps1`" %*`r`n", (New-Object Text.ASCIIEncoding))
$hostJson = Join-Path $upd "$HostName.json"
$hostDef = [ordered]@{
  name = $HostName
  description = "Timefill update helper"
  path = $cmd
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
[IO.File]::WriteAllText($hostJson, ($hostDef | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
if (-not $SkipRegistry) {
  foreach ($browser in @("Software\Google\Chrome", "Software\Microsoft\Edge")) {
    $k = "HKCU:\$browser\NativeMessagingHosts\$HostName"
    New-Item -Path $k -Force | Out-Null
    Set-Item -Path $k -Value $hostJson
  }
}
Say "  [3/4] Update helper set up (Chrome and Edge, for your Windows user only)" "Green"

# 4) load it in the browser --------------------------------------------------------------------------------------
# Timefill is the same extension for Google Chrome and Microsoft Edge. Browsers only let you add it yourself
# ("Load unpacked", once); this step opens the right page and copies the folder for you.
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $Browser) {
  if ($chrome -and $edge -and -not $NoBrowser) {
    Say ""
    Say "  Which browser do you use Timefill in?" "Cyan"
    Say "     1 = Google Chrome    2 = Microsoft Edge    3 = both" "White"
    $answer = Read-Host "  Your choice (1, 2 or 3, Enter = 1)"
    $Browser = @{ "2" = "edge"; "3" = "both" }[$answer.Trim()]
    if (-not $Browser) { $Browser = "chrome" }
  } elseif ($edge -and -not $chrome) { $Browser = "edge" } else { $Browser = "chrome" }
}
try { Set-Clipboard -Value $ext } catch { }
Say ""
Say "  [4/4] Last step, in your browser (only the first time):" "Green"
Say ""
if ($Browser -ne "edge") {
  Say "   Google Chrome:" "Cyan"
  Say "     a. The page chrome://extensions opens. Turn on 'Developer mode' (switch at the top right)." "White"
  Say "     b. Click 'Load unpacked'. In the folder window, paste the folder (Ctrl+V) in the address" "White"
  Say "        bar at the top, press Enter, then 'Select folder'." "White"
  Say "     c. Pin Timefill (puzzle-piece icon -> pin) and click it to start." "White"
  Say ""
}
if ($Browser -ne "chrome") {
  Say "   Microsoft Edge:" "Cyan"
  Say "     a. The page edge://extensions opens. Turn on 'Developer mode' (switch in the left column)." "White"
  Say "     b. Click 'Load unpacked'. In the folder window, paste the folder (Ctrl+V) in the address" "White"
  Say "        bar at the top, press Enter, then 'Select folder'." "White"
  Say "     c. Show Timefill in the toolbar (puzzle-piece icon -> eye icon) and click it to start." "White"
  Say ""
}
Say "   The folder (already copied, just paste it):" "Gray"
Say "     $ext" "Yellow"
Say ""
Say "  Already installed before? Then just press the reload icon on the Timefill card." "Gray"
Say "  From now on, updates come with one click: Timefill -> Settings -> Updates." "Gray"
Say ""
if (-not $NoBrowser) {
  if ($Browser -ne "edge") {
    if ($chrome) { Start-Process -FilePath $chrome -ArgumentList "chrome://extensions" } else { Say "  Chrome was not found: open chrome://extensions yourself." "Yellow" }
  }
  if ($Browser -ne "chrome") {
    if ($edge) { Start-Process -FilePath $edge -ArgumentList "edge://extensions" } else { Say "  Edge was not found: open edge://extensions yourself." "Yellow" }
  }
}
