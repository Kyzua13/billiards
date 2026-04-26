$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$radmin = Get-NetIPConfiguration |
  Where-Object { $_.InterfaceAlias -like "*Radmin*" -and $_.IPv4Address } |
  Select-Object -First 1

if (-not $radmin) {
  Write-Host ""
  Write-Host "Radmin VPN adapter was not found." -ForegroundColor Red
  Write-Host "Turn on Radmin VPN, connect to the same Radmin network as the other players, then run:"
  Write-Host "  npm run dev:radmin"
  exit 1
}

$ip = $radmin.IPv4Address[0].IPAddress
$env:VITE_WS_URL = "ws://$ip`:8787"

Write-Host ""
Write-Host "Radmin VPN ready" -ForegroundColor Green
Write-Host "Interface: $($radmin.InterfaceAlias)"
Write-Host "Client URL for other Radmin players:" -ForegroundColor Cyan
Write-Host "  http://$ip`:5173"
Write-Host "WebSocket URL:"
Write-Host "  $env:VITE_WS_URL"
Write-Host ""
Write-Host "If another player cannot open the page, allow inbound TCP ports 5173 and 8787 in Windows Defender Firewall."
Write-Host ""

Set-Location $repo
npm run dev
