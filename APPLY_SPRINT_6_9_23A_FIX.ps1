$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$wrongFile = Join-Path $projectRoot 'src\core\di\dependencyTokens.ts'
if (Test-Path $wrongFile) {
    Remove-Item $wrongFile -Force
    Write-Host 'Yanlis dependencyTokens.ts dosyasi silindi.' -ForegroundColor Yellow
}

$correctFile = Join-Path $projectRoot 'src\core\di\tokens.ts'
if (-not (Test-Path $correctFile)) {
    throw 'src\core\di\tokens.ts bulunamadi.'
}

Write-Host 'DI token duzeltmesi uygulandi.' -ForegroundColor Green
Write-Host 'Simdi npm run typecheck ve npm run build calistirin.'
