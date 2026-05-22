param(
  [string]$FrontendPort = "5173",
  [string]$ApiUrl = "http://localhost:3001",
  [switch]$Headed,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$jobs = @()

$resolvedFrontendPort = $FrontendPort
$resolvedApiUrl = $ApiUrl
$resolvedPlaywrightArgs = @($PlaywrightArgs)

if ($resolvedFrontendPort -notmatch '^\d+$') {
  $resolvedPlaywrightArgs = @($resolvedFrontendPort) + $resolvedPlaywrightArgs
  $resolvedFrontendPort = "5173"
}

if ($resolvedApiUrl -notmatch '^https?://') {
  $resolvedPlaywrightArgs = @($resolvedApiUrl) + $resolvedPlaywrightArgs
  $resolvedApiUrl = "http://localhost:3001"
}

$frontendUrl = "http://localhost:$resolvedFrontendPort"

function Test-UrlReady {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-Url {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timeout aguardando $Url"
}

try {
  if (-not (Test-UrlReady "$resolvedApiUrl/test-db")) {
    $jobs += Start-Job -Name "academia-backend-playwright" -ScriptBlock {
      param($cwd)
      Set-Location $cwd
      node backend/server.js
    } -ArgumentList $root
  }

  if (-not (Test-UrlReady "$frontendUrl/login")) {
    $jobs += Start-Job -Name "academia-frontend-playwright" -ScriptBlock {
      param($cwd, $apiUrl, $frontendPort)
      Set-Location $cwd
      $env:VITE_API_URL = $apiUrl
      $env:VITE_DEV_AUTO_LOGIN = "false"
      npm.cmd run dev -- --host localhost --port $frontendPort --strictPort
    } -ArgumentList (Join-Path $root "frontend"), $resolvedApiUrl, $resolvedFrontendPort
  }

  Wait-Url -Url "$resolvedApiUrl/test-db"
  Wait-Url -Url "$frontendUrl/login"

  $env:PLAYWRIGHT_BASE_URL = $frontendUrl
  $env:PLAYWRIGHT_FRONTEND_PORT = $resolvedFrontendPort
  $env:PLAYWRIGHT_API_URL = $resolvedApiUrl

  $resolvedArgs = @("playwright", "test")
  if ($Headed) {
    $resolvedArgs += "--headed"
  }
  if ($resolvedPlaywrightArgs) {
    $resolvedArgs += $resolvedPlaywrightArgs
  }

  & npx.cmd @resolvedArgs
  exit $LASTEXITCODE
} finally {
  foreach ($job in $jobs) {
    if ($job.State -eq "Running") {
      Stop-Job $job -ErrorAction SilentlyContinue
    }
    Remove-Job $job -Force -ErrorAction SilentlyContinue
  }
}
