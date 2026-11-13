$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$temp = [IO.Directory]::CreateTempSubdirectory('gym-smoke-').FullName
$node = (Get-Command node).Source
$api = $null

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

  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { $env:PORT = [string]$listener.LocalEndpoint.Port }
  finally { $listener.Stop() }
  $baseUrl = "http://127.0.0.1:$env:PORT"
  $stdout = Join-Path $temp 'api.stdout'
  $stderr = Join-Path $temp 'api.stderr'
  Push-Location $temp
  try {
    Invoke-Node --version
    Invoke-Node backend/scripts/seedDev.js
    $api = Start-Process -FilePath $node -ArgumentList 'backend/server.js' -WorkingDirectory $temp -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    $ready = $false
    foreach ($attempt in 1..30) {
      if ($api.HasExited) { break }
      try {
        Invoke-RestMethod "$baseUrl/health" -TimeoutSec 2 | Out-Null
        $ready = $true
        break
      } catch {
        Start-Sleep -Milliseconds 250
      }
    }
    if (!$ready) {
      Get-Content -LiteralPath $stdout, $stderr
      throw 'A API da base descartavel nao iniciou.'
    }

    # Identidade prepara a Rede B para os smokes que dependem dela.
    foreach ($smoke in @(
      'smoke-identidade', 'smoke-s1-p0', 'smoke-p1-pagamentos',
      'smoke-isolamento-transacao', 'smoke-a06-conta-fechamento',
      'smoke-financeiro-isolamento', 'smoke-l02', 'smoke-l02-ciclos',
      'smoke-cobertura', 'smoke-f0-acesso-datas', 'smoke-acesso', 'smoke-l04-integridade',
      'smoke-diagnostico-consistencia'
    )) {
      Invoke-Node "tests/scripts/$smoke.js" "--base-url=$baseUrl" '--db=backend/academia.sqlite'
    }
  } finally {
    Pop-Location
  }
} finally {
  if ($api -and !$api.HasExited) {
    Stop-Process -Id $api.Id
    $api.WaitForExit()
  }
  $resolved = (Resolve-Path -LiteralPath $temp).Path
  if ($resolved -eq $temp -and (Split-Path -Leaf $resolved) -like 'gym-smoke-*') {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
