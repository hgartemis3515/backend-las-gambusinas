param(
    [string]$BaseProyectos = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
    [switch]$SoloPreparar
)

$ErrorActionPreference = 'Stop'
$base = (Resolve-Path -LiteralPath $BaseProyectos).Path
$launcherDir = Join-Path $base 'las-gambusinas-launcher-rio-lindo'
if (-not (Test-Path -LiteralPath $launcherDir)) {
    $launcherDir = Join-Path $base 'las-gambusinas-launcher'
}
$profileDir = Join-Path $PSScriptRoot '.local\launcher'
$configDir = Join-Path $profileDir 'LasGambusinas'
$configFile = Join-Path $configDir 'launcher-config.json'
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $configFile)) {
    $config = [ordered]@{
        paths = @{
            backend = (Join-Path $base 'backend-rio-lindo')
            cocina = (Join-Path $base 'appcocina-rio-lindo')
            mozos = (Join-Path $base 'NO_CONFIGURADO_MOZOS')
            facturacion = (Join-Path $base 'NO_CONFIGURADO_FACTURACION')
        }
        ports = @{ backend = 3020; cocina = 3021; expoMetro = 8082; facturacion = 5175 }
        publicBaseUrl = 'http://127.0.0.1:3020'
        cloneParentDir = $base
        cloneUrls = @{
            backend = 'https://github.com/linareskiara005-hub/backend-rio-lindo.git'
            cocina = 'https://github.com/linareskiara005-hub/appcocina-rio-lindo.git'
            mozos = ''; facturacion = ''
        }
        autoStartLauncherWithWindows = $false
        autoStartServicesOnLauncherOpen = $false
        autoStartExpoWithServices = $false
        autoUpdate = $false
        showFirstRunWizard = $false
        showCloneSection = $false
        mongodb = @{ checkBeforeBackendStart = $true; forceBackendStartIfMongoFails = $false }
        npmScripts = @{ backend = 'start'; cocina = 'start'; expo = 'start'; facturacion = 'start' }
        stopAllOnQuit = $true
    }
    $json = $config | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($configFile, $json, (New-Object System.Text.UTF8Encoding($false)))
}
Write-Output "Configuracion aislada: $configFile"
if ($SoloPreparar) { return }

$electronExe = Join-Path $launcherDir 'node_modules\electron\dist\electron.exe'
$bootstrap = Join-Path $PSScriptRoot 'launcher-aislado.cjs'
if (-not (Test-Path -LiteralPath $electronExe)) {
    throw "Falta Electron. Ejecuta npm.cmd ci en $launcherDir"
}
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $electronExe
$startInfo.Arguments = '"' + $bootstrap + '"'
$startInfo.WorkingDirectory = $launcherDir
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.EnvironmentVariables['RIO_LINDO_LAUNCHER_DIR'] = $launcherDir
$startInfo.EnvironmentVariables['RIO_LINDO_PROFILE_ROOT'] = $profileDir
$startInfo.EnvironmentVariables['LAUNCHER_MONOREPO_ROOT'] = $base
$startInfo.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$launcherProcess = [System.Diagnostics.Process]::Start($startInfo)
Write-Output "Launcher iniciado. PID: $($launcherProcess.Id). Usa los botones individuales Backend y Cocina."
