param(
  [string]$Configuration = "Release",
  [string]$Runtime = "win-x64",
  [string]$PublishDir = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageScript = Join-Path $root "package-installer.ps1"
$bootstrapperProject = Join-Path $root "Restrix.Bootstrapper\\Restrix.Bootstrapper.csproj"
$dotnet = if ([string]::IsNullOrWhiteSpace($env:CONNECTAPP_DOTNET_EXE)) {
  if ([string]::IsNullOrWhiteSpace($env:RESTRIX_DOTNET_EXE)) { "dotnet" } else { $env:RESTRIX_DOTNET_EXE }
} else {
  $env:CONNECTAPP_DOTNET_EXE
}

Write-Host "Packaging ConnectApp.Installer.zip..." -ForegroundColor Cyan
& $packageScript -Configuration $Configuration -Runtime $Runtime

Write-Host "Publishing bootstrapper..." -ForegroundColor Cyan
if ([string]::IsNullOrWhiteSpace($PublishDir)) {
  & $dotnet publish $bootstrapperProject -c $Configuration -r $Runtime -p:SelfContained=true -p:PublishSingleFile=true
} else {
  & $dotnet publish $bootstrapperProject -c $Configuration -r $Runtime -p:SelfContained=true -p:PublishSingleFile=true -o $PublishDir
}

$defaultPublishDir = Join-Path $root "Restrix.Bootstrapper\\bin\\$Configuration\\net8.0-windows\\$Runtime\\publish"
$resolvedPublishDir = if ([string]::IsNullOrWhiteSpace($PublishDir)) { $defaultPublishDir } else { $PublishDir }
$bootstrapperExe = Join-Path $resolvedPublishDir "ConnectAppSetup.exe"

Write-Host "Bootstrapper ready: $bootstrapperExe" -ForegroundColor Green
