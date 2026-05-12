param()

$ErrorActionPreference = "Stop"
$script:RequiredFailure = $false

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host "[AVISO] $Message" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)
  Write-Host "[FALHOU] $Message" -ForegroundColor Red
  $script:RequiredFailure = $true
}

function Test-Command {
  param(
    [string]$Label,
    [string]$Command,
    [string[]]$Arguments = @(),
    [switch]$Required
  )

  try {
    $output = & $Command @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "exit $LASTEXITCODE"
    }

    $summary = ($output | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace([string]$summary)) {
      Write-Ok $Label
    } else {
      Write-Ok "$Label - $summary"
    }
  } catch {
    if ($Required) {
      Write-Fail "$Label nao encontrado ou indisponivel."
    } else {
      Write-Warn "$Label nao encontrado ou indisponivel."
    }
  }
}

function Test-RequiredPath {
  param(
    [string]$Label,
    [string]$Path
  )

  if (Test-Path -LiteralPath $Path) {
    Write-Ok "$Label encontrado."
  } else {
    Write-Fail "$Label ausente em $Path."
  }
}

function Test-OptionalPath {
  param(
    [string]$Label,
    [string]$Path,
    [string]$Warning
  )

  if (Test-Path -LiteralPath $Path) {
    Write-Ok "$Label encontrado."
  } else {
    Write-Warn $Warning
  }
}

Write-Host ""
Write-Host "== Check Env - Sistema Academia SA ==" -ForegroundColor Cyan
Write-Host ""

Test-Command -Label "Node.js" -Command "node" -Arguments @("-v") -Required
Test-Command -Label "npm" -Command "npm" -Arguments @("-v") -Required
Test-Command -Label "Git" -Command "git" -Arguments @("--version") -Required

Test-RequiredPath -Label "package.json da raiz" -Path "package.json"
Test-RequiredPath -Label "frontend/package.json" -Path "frontend/package.json"
Test-RequiredPath -Label "backend/server.js" -Path "backend/server.js"

Test-OptionalPath -Label "backend/.env.example" -Path "backend/.env.example" -Warning "backend/.env.example nao encontrado."
Test-OptionalPath -Label "frontend/.env.example" -Path "frontend/.env.example" -Warning "frontend/.env.example nao encontrado."
Test-OptionalPath -Label "tests/scripts/smoke-auth.ps1" -Path "tests/scripts/smoke-auth.ps1" -Warning "tests/scripts/smoke-auth.ps1 nao encontrado."

Test-OptionalPath -Label "node_modules da raiz" -Path "node_modules" -Warning "node_modules da raiz nao encontrado. Execute npm install na raiz."
Test-OptionalPath -Label "frontend/node_modules" -Path "frontend/node_modules" -Warning "frontend/node_modules nao encontrado. Execute npm install dentro de frontend."

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3001/test-db" -TimeoutSec 5
  if ([int]$response.StatusCode -eq 200) {
    Write-Ok "Backend respondeu em /test-db."
  } else {
    Write-Warn "Backend respondeu em /test-db com status $($response.StatusCode)."
  }
} catch {
  Write-Warn "Backend nao respondeu em /test-db. Inicie com npm run backend ou node backend/server.js."
}

Write-Host ""

if ($script:RequiredFailure) {
  Write-Host "Resultado: ambiente incompleto." -ForegroundColor Red
  exit 1
}

Write-Host "Resultado: verificacao concluida." -ForegroundColor Green
exit 0
