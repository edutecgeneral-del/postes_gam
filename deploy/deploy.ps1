<#
.SYNOPSIS
    Deploy automatizado de field-coord (V1, V2, V3) al VPS.
.DESCRIPTION
    Build + version.txt + tar + scp + extract + verify para cualquier ambiente.
    Uso: .\deploy\deploy.ps1 [-Env v1|v2|v3] [-SkipBuild] [-DryRun]
.PARAMETER Env
    Ambiente: v1, v2, v3 (default v3)
.PARAMETER SkipBuild
    Saltar el npm run build (usa el dist existente)
.PARAMETER DryRun
    Modo prueba: build local pero no sube ni aplica
.EXAMPLE
    .\deploy\deploy.ps1
    Deploy a V3 (default)
.EXAMPLE
    .\deploy\deploy.ps1 -Env v2
    Deploy a V2 (require .env.v2 con creds reales)
.EXAMPLE
    .\deploy\deploy.ps1 -Env v3 -DryRun
    Simulacion sin subir
#>

param(
    [ValidateSet('v1','v2','v3')]
    [string]$Env = 'v3',
    [switch]$SkipBuild,
    [switch]$DryRun
)

# Configuracion por ambiente
$VPS = "root@ci1215.duckdns.org"
$envConfig = @{
    v1 = @{
        BasePath    = '/CI1215'
        RemoteDist  = '/var/www/field-coord/dist'
        Domain      = 'https://ci1215.duckdns.org/CI1215'
        SupabaseRef = 'wmwbflhtwnlmcxxinutb'
    }
    v2 = @{
        BasePath    = '/CI1215V2'
        RemoteDist  = '/var/www/field-coord-v2/dist'
        Domain      = 'https://ci1215.duckdns.org/CI1215V2'
        SupabaseRef = 'rcwmjgcnpqlwrckcymrj'
    }
    v3 = @{
        BasePath    = '/CI1215V3'
        RemoteDist  = '/var/www/field-coord-v3/dist'
        Domain      = 'https://ci1215.duckdns.org/CI1215V3'
        SupabaseRef = 'qogxkvkgpyfnqabzkfft'
    }
}
$config = $envConfig[$Env]
$envFile = ".env.$Env"
$RemoteTmp = "/tmp/dist-$Env-new.tar.gz"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  DEPLOY field-coord [$($Env.ToUpper())]" -ForegroundColor Magenta
Write-Host "  Target: $($config.Domain)/" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta

# Verificaciones previas
if (-not (Test-Path "package.json")) {
    Write-Fail "No estas en la carpeta del proyecto"
    exit 1
}

if (-not (Test-Path $envFile)) {
    Write-Fail "No existe $envFile"
    Write-Host ""
    Write-Host "Para crear $envFile :" -ForegroundColor Yellow
    Write-Host "  1. Copia la plantilla:"
    Write-Host "       Copy-Item $envFile.example $envFile"
    Write-Host "  2. Edita $envFile y pega la ANON_KEY real."
    Write-Host "     URL: https://supabase.com/dashboard/project/$($config.SupabaseRef)/settings/api-keys"
    exit 1
}

$envFileContent = Get-Content $envFile -Raw
if ($envFileContent -notmatch [regex]::Escape($config.SupabaseRef)) {
    Write-Fail "$envFile no apunta a Supabase $Env"
    exit 1
}
if ($envFileContent -match "<PEGA_AQUI") {
    Write-Fail "$envFile tiene placeholder. Pega la ANON_KEY real primero."
    exit 1
}
Write-OK "Verificaciones previas OK"

# Backup del .env actual antes de sobrescribirlo
$envBackup = ".env.deploy.bak"
$envBackupCreated = $false
if (Test-Path .env) {
    Copy-Item .env $envBackup -Force
    $envBackupCreated = $true
}

try {
    # Activar el .env del ambiente
    Copy-Item $envFile .env -Force
    Write-OK ".env activado para $Env"
    $env:VITE_BUILD_ENV = $Env

    # 1. Build
    if (-not $SkipBuild) {
        Write-Step "1/6 Build con vite (env=$Env)"
        Remove-Item -Path dist -Recurse -Force -ErrorAction SilentlyContinue
        npm run build
        if ($LASTEXITCODE -ne 0) { Write-Fail "npm run build fallo"; exit 1 }
        if (-not (Test-Path dist\index.html)) { Write-Fail "index.html NO se genero"; exit 1 }
        Write-OK "Build completo"
    } else {
        Write-Step "1/6 Build saltado (-SkipBuild)"
        if (-not (Test-Path dist\index.html)) { Write-Fail "No hay dist/index.html. Quita -SkipBuild."; exit 1 }
    }

    # 2. version.txt
    Write-Step "2/6 Generando version.txt"
    $version = "$Env-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    [System.IO.File]::WriteAllText("$(Get-Location)\dist\version.txt", $version, (New-Object System.Text.UTF8Encoding $false))
    Write-OK "Version: $version"

    # 3. Tar
    Write-Step "3/6 Empaquetando"
    Remove-Item dist.tar.gz -ErrorAction SilentlyContinue
    tar -czf dist.tar.gz -C dist .
    $size = (Get-Item dist.tar.gz).Length / 1KB
    Write-OK ("Empaquetado: {0:N0} KB" -f $size)

    # 4. SCP
    Write-Step "4/6 Subiendo al VPS"
    if ($DryRun) {
        Write-Host "  [DRY-RUN] scp dist.tar.gz ${VPS}:${RemoteTmp}"
    } else {
        scp dist.tar.gz "${VPS}:${RemoteTmp}"
        if ($LASTEXITCODE -ne 0) { Write-Fail "scp fallo"; exit 1 }
        Write-OK "Subido"
    }

    # 5. SSH extract
    Write-Step "5/6 Extrayendo en el VPS"
    $remoteDist = $config.RemoteDist
    $sshCmd = "TS=`$(date +%Y%m%d-%H%M%S); cp -r ${remoteDist} ${remoteDist}.bak.`$TS 2>/dev/null; rm -rf ${remoteDist}/*; tar -xzf ${RemoteTmp} -C ${remoteDist}/; chown -R www-data:www-data ${remoteDist}; chmod -R 755 ${remoteDist}; rm ${RemoteTmp}; echo '--- index.html ---'; ls -l ${remoteDist}/index.html; echo '--- version ---'; cat ${remoteDist}/version.txt"

    if ($DryRun) {
        Write-Host "  [DRY-RUN] ssh $VPS '...extract+permisos+cleanup...'"
        Write-Host "  [DRY-RUN] Target: $remoteDist"
    } else {
        ssh $VPS $sshCmd
        if ($LASTEXITCODE -ne 0) { Write-Fail "ssh fallo"; exit 1 }
    }

    # 6. Verificar
    Write-Step "6/6 Verificando produccion"
    if (-not $DryRun) {
        Start-Sleep -Seconds 2
        $liveVersion = curl.exe -s "$($config.Domain)/version.txt"
        if ($liveVersion -eq $version) {
            Write-OK "Version en produccion: $liveVersion"
        } else {
            Write-Fail "Version NO coincide (live='$liveVersion' vs '$version')"
        }
    } else {
        Write-Host "  [DRY-RUN] curl $($config.Domain)/version.txt"
    }

    Remove-Item dist.tar.gz -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host " DEPLOY $($Env.ToUpper()) COMPLETADO" -ForegroundColor Green
    Write-Host " URL: $($config.Domain)/" -ForegroundColor Green
    Write-Host " Version: $version" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
}
finally {
    # Limpiar env var
    Remove-Item Env:\VITE_BUILD_ENV -ErrorAction SilentlyContinue

    # Restaurar el .env original SIEMPRE (incluso si hubo error)
    if ($envBackupCreated -and (Test-Path $envBackup)) {
        Copy-Item $envBackup .env -Force
        Remove-Item $envBackup -Force
        Write-OK ".env restaurado al original"
    }
}