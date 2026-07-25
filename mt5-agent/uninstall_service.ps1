# HashiBot MT5 Agent - Windows Background Service Removal Script

param (
    [string]$ServiceName = "HashiBotMT5Agent"
)

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cipher
Write-Host "  Removing HashiBot MT5 Agent Windows Service      " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cipher

$nssm = Get-Command nssm -ErrorAction SilentlyContinue

if ($nssm) {
    Write-Host "[Uninstaller] Stopping and removing service via NSSM..." -ForegroundColor Yellow
    nssm stop $ServiceName confirm
    nssm remove $ServiceName confirm
    Write-Host "[Success] Service '$ServiceName' removed successfully." -ForegroundColor Green
} else {
    Write-Host "[Uninstaller] Stopping service via sc.exe..." -ForegroundColor Yellow
    sc.exe stop $ServiceName
    sc.exe delete $ServiceName
    Write-Host "[Success] Service '$ServiceName' deletion command issued." -ForegroundColor Green
}
