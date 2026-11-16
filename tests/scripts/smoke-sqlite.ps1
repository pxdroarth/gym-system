param(
  [switch]$Playwright,
  [string[]]$PlaywrightFiles,
  [string]$PlaywrightGrep
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
if (!$Playwright -and ($PlaywrightFiles -or $PlaywrightGrep)) {
  throw 'Use -Playwright para selecionar arquivos ou cenarios.'
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$temp = [IO.Directory]::CreateTempSubdirectory('gym-smoke-').FullName
$node = (Get-Command node).Source
$api = $null
$frontend = $null

function Get-FreePort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { $listener.LocalEndpoint.Port }
  finally { $listener.Stop() }
}

function Wait-Server($Process, $Url, $Stdout, $Stderr) {
  foreach ($attempt in 1..60) {
    if ($Process.HasExited) { break }
    try {
      Invoke-WebRequest $Url -TimeoutSec 2 | Out-Null
      return
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  Get-Content -LiteralPath $Stdout, $Stderr
  throw "Servidor indisponivel: $Url"
}

function Invoke-Node {
  Write-Host "node $($args -join ' ')"
  & $node @args
  if ($LASTEXITCODE -ne 0) {
    throw "node $($args[0]) retornou $LASTEXITCODE."
  }
}

try {
  # The backend opens SQLite next to database.js. Copy the code without
  # any databases, credentials or uploads from the developer workspace.
  robocopy (Join-Path $repo 'backend') (Join-Path $temp 'backend') /E /XF '*.sqlite*' '.env*' /XD uploads node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'Falha ao copiar o backend para a base descartavel.' }
  New-Item -ItemType Directory -Path (Join-Path $temp 'tests') | Out-Null
  Copy-Item -LiteralPath $PSScriptRoot -Destination (Join-Path $temp 'tests/scripts') -Recurse
  Copy-Item -LiteralPath (Join-Path $repo 'package.json') -Destination $temp

  $env:NODE_PATH = Join-Path $repo 'node_modules'
  $env:NODE_ENV = 'development'
  $env:APP_TIMEZONE = 'America/Sao_Paulo'
  $env:ALLOW_LEGACY_OPERATOR_HEADERS = 'false'
  $env:SEED_DEV_PASSWORD = [guid]::NewGuid().ToString('N')
  $env:BOOTSTRAP_ADMIN_PASSWORD = [guid]::NewGuid().ToString('N')
  $env:SMOKE_PLATFORM_LOGIN = 'admin'
  $env:SMOKE_PLATFORM_PASSWORD = $env:BOOTSTRAP_ADMIN_PASSWORD

  $env:PORT = [string](Get-FreePort)
  $baseUrl = "http://127.0.0.1:$env:PORT"
  if ($Playwright) {
    do { $frontendPort = Get-FreePort } while ($frontendPort -eq [int]$env:PORT)
    $env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:$frontendPort"
    $env:PLAYWRIGHT_API_URL = $baseUrl
    $env:CORS_ORIGINS = $env:PLAYWRIGHT_BASE_URL
    $env:FRONTEND_URL = $env:PLAYWRIGHT_BASE_URL
    $env:VITE_API_URL = $baseUrl
    $env:VITE_DEV_AUTO_LOGIN = 'false'
    $env:E2E_LOGIN = 'owner'
    $env:E2E_PASSWORD = $env:SEED_DEV_PASSWORD
    $env:E2E_DISPOSABLE_SQLITE = 'true'
  }
  $stdout = Join-Path $temp 'api.stdout'
  $stderr = Join-Path $temp 'api.stderr'
  Push-Location $temp
  try {
    Invoke-Node --version
    Invoke-Node backend/scripts/seedDev.js
    $api = Start-Process -FilePath $node -ArgumentList 'backend/server.js' -WorkingDirectory $temp -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    Wait-Server $api "$baseUrl/health" $stdout $stderr

    if ($Playwright) {
      $webStdout = Join-Path $temp 'frontend.stdout'
      $webStderr = Join-Path $temp 'frontend.stderr'
      $frontend = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', $frontendPort, '--strictPort', '--open', 'false') -WorkingDirectory (Join-Path $repo 'frontend') -RedirectStandardOutput $webStdout -RedirectStandardError $webStderr -WindowStyle Hidden -PassThru
      Wait-Server $frontend "$env:PLAYWRIGHT_BASE_URL/login" $webStdout $webStderr
      $playwrightArgs = @('test') + $PlaywrightFiles
      if ($PlaywrightGrep) { $playwrightArgs += @('--grep', $PlaywrightGrep) }
      Push-Location $repo
      try { Invoke-Node node_modules/@playwright/test/cli.js @playwrightArgs }
      finally { Pop-Location }
      return
    }

    # Identidade prepara a Rede B para os smokes que dependem dela.
    foreach ($smoke in @(
      'smoke-identidade', 'smoke-s1-p0', 'smoke-p1-pagamentos',
      'smoke-isolamento-transacao', 'smoke-a06-conta-fechamento',
      'smoke-financeiro-isolamento', 'smoke-l02', 'smoke-l02-ciclos',
      'smoke-cobertura', 'smoke-f0-acesso-datas', 'smoke-acesso', 'smoke-l04-integridade',
      'smoke-diagnostico-consistencia', 'smoke-l04-estorno-venda'
    )) {
      Invoke-Node "tests/scripts/$smoke.js" "--base-url=$baseUrl" '--db=backend/academia.sqlite'
    }
    Invoke-Node 'tests/scripts/smoke-l04-estorno-venda-datas.js'
  } finally {
    Pop-Location
  }
} finally {
  if ($frontend -and !$frontend.HasExited) {
    Stop-Process -Id $frontend.Id
    $frontend.WaitForExit()
  }
  if ($api -and !$api.HasExited) {
    Stop-Process -Id $api.Id
    $api.WaitForExit()
  }
  $resolved = (Resolve-Path -LiteralPath $temp).Path
  if ($resolved -eq $temp -and (Split-Path -Leaf $resolved) -like 'gym-smoke-*') {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
