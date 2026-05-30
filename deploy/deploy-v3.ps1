<#
.SYNOPSIS
    Deploy automatizado de field-coord V3 al VPS.
#>

param(
    [switch]$SkipBuild,
    [switch]$DryRun
)

# Configuración
$VPS = "root@ci1215.duckdns.org"
$REMOTE_DIST = "/var/www/field-coord-v3/dist"
$REMOTE_TMP = "/tmp/dist-v3-new.tar.gz"
$DOMAIN = "https://ci1215.duckdns.org/CI1215V3"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

if (-not (Test-Path "package.json")) {
    Write-Fail "No estás en la carpeta del proyecto"
    exit 1
}

$viteConfig = Get-Content vite.config.js -Raw
if ($viteConfig -notmatch "/CI1215V3/") {
    Write-Fail "vite.config.js NO apunta a /CI1215V3/"
    exit 1
}

$envFile = Get-Content .env -Raw -ErrorAction SilentlyContinue
if ($envFile -notmatch "qogxkvkgpyfnqabzkfft") {
    Write-Fail ".env NO apunta a Supabase V3"
    exit 1
}

Write-OK "Verificaciones previas pasaron"

if (-not $SkipBuild) {
    Write-Step "1/6 Build con vite"
    Remove-Item -Path dist -Recurse -Force -ErrorAction SilentlyContinue
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm run build fallo"
        exit 1
    }
    if (-not (Test-Path dist\index.html)) {
        Write-Fail "index.html NO se genero"
        exit 1
    }
    Write-OK "Build completo"
} else {
    Write-Step "1/6 Build saltado (-SkipBuild)"
}

Write-Step "2/6 Generando version.txt"
$version = Get-Date -Format 'yyyyMMdd-HHmmss'
[System.IO.File]::WriteAllText("$(Get-Location)\dist\version.txt", $version, (New-Object System.Text.UTF8Encoding $false))
Write-OK "Version: $version"

Write-Step "3/6 Empaquetando"
Remove-Item dist.tar.gz -ErrorAction SilentlyContinue
tar -czf dist.tar.gz -C dist .
$size = (Get-Item dist.tar.gz).Length / 1KB
Write-OK ("Empaquetado: {0:N0} KB" -f $size)

Write-Step "4/6 Subiendo al VPS"
if ($DryRun) {
    Write-Host "  [DRY-RUN] scp dist.tar.gz ${VPS}:${REMOTE_TMP}"
} else {
    scp dist.tar.gz "${VPS}:${REMOTE_TMP}"
    if ($LASTEXITCODE -ne 0) { Write-Fail "scp fallo"; exit 1 }
    Write-OK "Subido"
}

Write-Step "5/6 Extrayendo en el VPS"
$sshCmd = "TS=`$(date +%Y%m%d-%H%M%S); cp -r ${REMOTE_DIST} ${REMOTE_DIST}.bak.`$TS 2>/dev/null; rm -rf ${REMOTE_DIST}/*; tar -xzf ${REMOTE_TMP} -C ${REMOTE_DIST}/; chown -R www-data:www-data ${REMOTE_DIST}; chmod -R 755 ${REMOTE_DIST}; rm ${REMOTE_TMP}; echo '--- index.html ---'; ls -l ${REMOTE_DIST}/index.html; echo '--- version ---'; cat ${REMOTE_DIST}/version.txt"

if ($DryRun) {
    Write-Host "  [DRY-RUN] ssh $VPS '...comando largo...'"
} else {
    ssh $VPS $sshCmd
    if ($LASTEXITCODE -ne 0) { Write-Fail "ssh fallo"; exit 1 }
}

Write-Step "6/6 Verificando produccion"
if (-not $DryRun) {
    Start-Sleep -Seconds 2
    $liveVersion = curl.exe -s "${DOMAIN}/version.txt"
    if ($liveVersion -eq $version) {
        Write-OK "Version en produccion: $liveVersion"
    } else {
        Write-Fail "Version NO coincide ($liveVersion vs $version)"
    }
}

Remove-Item dist.tar.gz -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host " DEPLOY V3 COMPLETADO" -ForegroundColor Green
Write-Host " URL: $DOMAIN/" -ForegroundColor Green
Write-Host " Version: $version" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green