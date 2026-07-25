# HashiBot MT5 Agent - Windows Background Service Installation Script
# Uses NSSM (Non-Sucking Service Manager) or sc.exe to register mt5-agent as a Windows service

param (
    [string]$ServiceName = "HashiBotMT5Agent",
    [string]$DisplayName = "HashiBot MT5 Terminal Agent",
    [string]$Description = "HashiBot MetaTrader 5 Terminal Bridge Agent Daemon"
)

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cipher
Write-Host "  Installing HashiBot MT5 Agent as Windows Service " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cipher

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$VenvPython = Join-Path $ScriptDir "venv\Scripts\python.exe"
$MainPy = Join-Path $ScriptDir "main.py"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[Error] Virtual environment Python not found at: $VenvPython" -ForegroundColor Red
    Write-Host "Please run 'python -m venv venv' and install requirements first." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $MainPy)) {
    Write-Host "[Error] main.py not found at: $MainPy" -ForegroundColor Red
    exit 1
}

# Check if NSSM is available in PATH
$nssm = Get-Command nssm -ErrorAction SilentlyContinue

if ($nssm) {
    Write-Host "[Installer] Configuring Windows Service using NSSM..." -ForegroundColor Green
    nssm install $ServiceName $VenvPython $MainPy
    nssm set $ServiceName AppDirectory $ScriptDir
    nssm set $ServiceName DisplayName $DisplayName
    nssm set $ServiceName Description $Description
    nssm set $ServiceName Start SERVICE_AUTO_START
    nssm start $ServiceName
    Write-Host "[Success] Service '$ServiceName' installed and started successfully via NSSM." -ForegroundColor Green
} else {
    Write-Host "[Installer] NSSM not detected. Downloading NSSM or registering via Task Scheduler / sc..." -ForegroundColor Yellow
    Write-Host "Recommended: Download nssm from https://nssm.cc/ and place nssm.exe in C:\Windows\System32" -ForegroundColor Yellow
    
    # Fallback registry registration instructions
    Write-Host "To manually register with sc.exe:" -ForegroundColor Cyan
    Write-Host "sc.exe create $ServiceName binPath= `"$VenvPython $MainPy`" start= auto DisplayName= `"$DisplayName`""
}
