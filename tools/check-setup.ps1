#Requires -Version 5.1
<#
    Comprobación mínima para HomePunk.
    No instala nada, no firma nada y no se conecta a la TV.
#>

$ErrorActionPreference = 'Continue'
$missing = 0

function Check-Tool {
    param([string]$Name, [string]$Command, [string]$Hint)
    $found = Get-Command $Command -ErrorAction SilentlyContinue
    if ($found) {
        Write-Host "[OK]   $Name -> $($found.Source)" -ForegroundColor Green
        return $found.Source
    }
    Write-Host "[FALTA] $Name. $Hint" -ForegroundColor Yellow
    $script:missing++
    return $null
}

function Check-File {
    param([string]$Name, [string]$Path)
    if (Test-Path -LiteralPath $Path) {
        Write-Host "[OK]   $Name" -ForegroundColor Green
    } else {
        Write-Host "[FALTA] $Name -> $Path" -ForegroundColor Yellow
        $script:missing++
    }
}

Write-Host "HomePunk - comprobación de entorno" -ForegroundColor Cyan
Write-Host ""

Check-Tool "Node.js" "node" "Instala Node.js 20+ desde https://nodejs.org/en/download" | Out-Null
Check-Tool "npm" "npm" "Viene con Node.js" | Out-Null
Check-Tool "dotnet" "dotnet" "Instala el .NET SDK compatible con Tizen Studio" | Out-Null

$tizen = Get-Command "tizen" -ErrorAction SilentlyContinue
if ($tizen) {
    Write-Host "[OK]   Tizen CLI -> $($tizen.Source)" -ForegroundColor Green
} elseif (Test-Path "C:\tizen-sdk\tools\ide\bin\tizen.bat") {
    Write-Host "[OK]   Tizen CLI -> C:\tizen-sdk\tools\ide\bin\tizen.bat" -ForegroundColor Green
} else {
    Write-Host "[FALTA] Tizen CLI. Instala Tizen Studio con TV Extension." -ForegroundColor Yellow
    Write-Host "       https://developer.tizen.org/development/tizen-studio/download"
    $missing++
}

$sdb = Get-Command "sdb" -ErrorAction SilentlyContinue
if ($sdb) {
    Write-Host "[OK]   SDB -> $($sdb.Source)" -ForegroundColor Green
} elseif (Test-Path "C:\tizen-sdk\tools\sdb.exe") {
    Write-Host "[OK]   SDB -> C:\tizen-sdk\tools\sdb.exe" -ForegroundColor Green
} else {
    Write-Host "[FALTA] SDB. Instala Tizen Studio." -ForegroundColor Yellow
    $missing++
}

Check-File "package.json" "package.json"
Check-File "config del launcher" "public\config.xml"
Check-File "proyecto del watcher" "native\ArtWatchTv\ArtWatchTv.csproj"
Check-File "manifiesto del watcher" "native\ArtWatchTv\tizen-manifest.xml"

Write-Host ""
if ($missing -eq 0) {
    Write-Host "Entorno básico listo. Siguiente: npm ci; npm run build." -ForegroundColor Green
    Write-Host "Después crea tu perfil de firma en Tizen Studio e instala con tizen install." -ForegroundColor Cyan
    exit 0
}

Write-Host "Faltan $missing elemento(s). Revisa los avisos de arriba." -ForegroundColor Yellow
exit 1
