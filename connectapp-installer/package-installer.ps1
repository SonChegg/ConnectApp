param(
  [string]$Configuration = "Release",
  [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$installerProject = Join-Path $root "Restrix.Installer\\Restrix.Installer.csproj"
$publishDir = Join-Path $root "Restrix.Installer\\bin\\$Configuration\\net8.0-windows\\$Runtime\\publish"
$zipPath = Join-Path $root "ConnectApp.Installer.zip"
$dotnet = if ([string]::IsNullOrWhiteSpace($env:CONNECTAPP_DOTNET_EXE)) {
  if ([string]::IsNullOrWhiteSpace($env:RESTRIX_DOTNET_EXE)) { "dotnet" } else { $env:RESTRIX_DOTNET_EXE }
} else {
  $env:CONNECTAPP_DOTNET_EXE
}

Write-Host "Publishing installer..." -ForegroundColor Cyan
& $dotnet publish $installerProject -c $Configuration -r $Runtime -p:SelfContained=true -p:PublishSingleFile=false

Write-Host "Packaging installer zip..." -ForegroundColor Cyan
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $publishDir "*") -DestinationPath $zipPath -Force
Write-Host "Installer package created: $zipPath" -ForegroundColor Green
