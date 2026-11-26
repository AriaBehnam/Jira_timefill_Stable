# Timefill - Jira hours from your Outlook calendar.
# Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
# SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
#
# The Timefill update helper. Chrome (or Edge) starts it when you press "Update" in Timefill ("native messaging":
# one JSON message in, one JSON answer out). It only knows two commands:
#   check   - which version is installed, and which is the latest stable version on GitHub
#   update  - download the latest stable version from GitHub and put it in place of the installed one
# It only downloads from the Timefill stable repository below, and only writes inside the Timefill folder.
# Only the Timefill extension may start it (allowed_origins in com.timefill.updater.json).

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"          # no progress output: stdout carries the answer only
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo    = "AriaBehnam/Jira_timefill_Stable"     # the only place updates come from
$Branch  = "main"
$Key     = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyPhAxaWLY0peL4sSe5tkTbSxXsFIFtHqedLfp+wdEV3gJmPoYFm1rftW8lhg2lFg+7FhipWQi9G/+QGl4++xlsMyu6xriS+mzYhpbbBOIHk52xrll9f7f3Z9HBCy4i8A9LBOqg0DQmkbLaJESr7miTi72H9S3uGfBIo5WAq8gt76R8r9GwgGeqZ1QBoauX04awafCrNpewu9OsZJCMPJZmseRLGBENebFqIw3qMWfl6EG2U++OYcErv+S2XIFSPP8bmaz8mupgJGgT/hxWLnDQSv/YgPMm0/0PBEG6RimeLLsyQG7fGqoHkViEE08/SJtY7Y1XlbOyB9hJ5VJLhvLwIDAQAB"
$Root    = Split-Path -Parent $PSScriptRoot       # ...\Timefill  (this file is in ...\Timefill\updater)
$ExtDir  = Join-Path $Root "extension"

# ---------------------------------------------------------------- native messaging: 4-byte length + UTF-8 JSON
function Read-Message {
  $in = [Console]::OpenStandardInput()
  $head = New-Object byte[] 4
  $got = 0
  while ($got -lt 4) { $n = $in.Read($head, $got, 4 - $got); if ($n -le 0) { return $null }; $got += $n }
  $len = [BitConverter]::ToInt32($head, 0)
  if ($len -le 0 -or $len -gt 65536) { return $null }
  $buf = New-Object byte[] $len
  $got = 0
  while ($got -lt $len) { $n = $in.Read($buf, $got, $len - $got); if ($n -le 0) { return $null }; $got += $n }
  return ([Text.Encoding]::UTF8.GetString($buf) | ConvertFrom-Json)
}
function Send-Message($obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress -Depth 4))
  $out = [Console]::OpenStandardOutput()
  $out.Write([BitConverter]::GetBytes([int]$bytes.Length), 0, 4)
  $out.Write($bytes, 0, $bytes.Length)
  $out.Flush()
}

# ---------------------------------------------------------------- helpers
function Get-Version([string]$manifestPath) {
  if (-not (Test-Path -LiteralPath $manifestPath)) { return $null }
  return ((Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8) | ConvertFrom-Json).version
}
function Test-Newer([string]$latest, [string]$installed) {
  if (-not $installed) { return $true }
  try { return ([version]$latest -gt [version]$installed) } catch { return ($latest -ne $installed) }
}
# The installed copy carries Timefill's fixed identity ("key"), so the update helper and your settings stay with it.
function Add-Key([string]$manifestPath) {
  $text = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
  if ($text -notmatch '"key"\s*:') {
    $text = $text -replace '^\s*\{', ("{`r`n  `"key`": `"" + $Key + "`",")
    [IO.File]::WriteAllText($manifestPath, $text, (New-Object Text.UTF8Encoding($false)))
  }
}

function Invoke-Check {
  $installed = Get-Version (Join-Path $ExtDir "manifest.json")
  $raw = Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/$Repo/$Branch/extension/manifest.json" -Headers @{ "Cache-Control" = "no-cache" }
  $latest = ($raw.Content | ConvertFrom-Json).version
  return @{ ok = $true; installed = $installed; latest = $latest; update = (Test-Newer $latest $installed) }
}

function Invoke-Update {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("timefill-update-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $zip = Join-Path $tmp "timefill.zip"
    Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$Repo/zip/refs/heads/$Branch" -OutFile $zip
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $tmp "x") -Force
    $new = Get-ChildItem -LiteralPath (Join-Path $tmp "x") -Directory | Select-Object -First 1
    $newExt = Join-Path $new.FullName "extension"
    $newManifest = Join-Path $newExt "manifest.json"
    if (-not (Test-Path -LiteralPath $newManifest)) { throw "the download has no Timefill extension in it" }
    $m = (Get-Content -LiteralPath $newManifest -Raw -Encoding UTF8) | ConvertFrom-Json
    if ($m.name -notmatch "^Timefill") { throw "the download is not Timefill" }
    # put the new files in place of the old ones (only inside the Timefill extension folder)
    if (-not (Test-Path -LiteralPath $ExtDir)) { New-Item -ItemType Directory -Path $ExtDir | Out-Null }
    $keep = @{}
    Get-ChildItem -LiteralPath $newExt -Recurse -File | ForEach-Object { $keep[$_.FullName.Substring($newExt.Length).ToLower()] = $true }
    Get-ChildItem -LiteralPath $ExtDir -Recurse -File | Where-Object { -not $keep.ContainsKey($_.FullName.Substring($ExtDir.Length).ToLower()) } | Remove-Item -Force
    Copy-Item -Path (Join-Path $newExt "*") -Destination $ExtDir -Recurse -Force
    Add-Key (Join-Path $ExtDir "manifest.json")
    return @{ ok = $true; version = $m.version }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# ---------------------------------------------------------------- one message in, one answer out
try {
  $msg = Read-Message
  if ($null -eq $msg) { exit 0 }
  switch ($msg.cmd) {
    "check"  { Send-Message (Invoke-Check) }
    "update" { Send-Message (Invoke-Update) }
    default  { Send-Message @{ ok = $false; error = "unknown command" } }
  }
} catch {
  Send-Message @{ ok = $false; error = $_.Exception.Message }
}
