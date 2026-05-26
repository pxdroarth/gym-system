param(
  [switch]$InstallDeps
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$RootPackagePath = Join-Path $RepoRoot "package.json"
$RootLockPath = Join-Path $RepoRoot "package-lock.json"
$FrontendPackagePath = Join-Path $RepoRoot "frontend\package.json"
$FrontendLockPath = Join-Path $RepoRoot "frontend\package-lock.json"
$BackendPackagePath = Join-Path $RepoRoot "backend\package.json"
$DoctorCmdPath = Join-Path $RepoRoot "tests\scripts\env-doctor.cmd"

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host ("== {0} ==" -f $Title) -ForegroundColor Cyan
}

function Write-Info {
  param([string]$Message)
  Write-Host ("[INFO] {0}" -f $Message) -ForegroundColor White
}

function Write-Ok {
  param([string]$Message)
  Write-Host ("[OK] {0}" -f $Message) -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host ("[WARN] {0}" -f $Message) -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)
  Write-Host ("[FAIL] {0}" -f $Message) -ForegroundColor Red
}

function Get-CommandInfo {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($null -ne $command) {
      return $command
    }
  }

  return $null
}

function Invoke-CommandForVersion {
  param(
    [string[]]$Candidates,
    [string[]]$Arguments
  )

  $command = Get-CommandInfo -Candidates $Candidates
  if ($null -eq $command) {
    return [PSCustomObject]@{
      Found = $false
      Path = $null
      Output = $null
      Error = $null
    }
  }

  try {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $output = & $command.Source @Arguments 2>&1
      $exitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousPreference
    }

    if ($exitCode -ne 0) {
      return [PSCustomObject]@{
        Found = $true
        Path = $command.Source
        Output = $null
        Error = "exit $exitCode"
      }
    }

    $summary = (($output | Select-Object -First 1) -as [string]).Trim()
    return [PSCustomObject]@{
      Found = $true
      Path = $command.Source
      Output = $summary
      Error = $null
    }
  } catch {
    return [PSCustomObject]@{
      Found = $true
      Path = $command.Source
      Output = $null
      Error = (($_.Exception.Message -split "\r?\n")[0]).Trim()
    }
  }
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Parse-Version {
  param([string]$Version)

  $normalized = ([string]$Version).Trim().Trim('"').TrimStart("v")
  $match = [regex]::Match($normalized, "^(?<major>\d+)(?:\.(?<minor>\d+))?(?:\.(?<patch>\d+))?")
  if (-not $match.Success) {
    return $null
  }

  return [PSCustomObject]@{
    Major = [int]$match.Groups["major"].Value
    Minor = if ($match.Groups["minor"].Success) { [int]$match.Groups["minor"].Value } else { 0 }
    Patch = if ($match.Groups["patch"].Success) { [int]$match.Groups["patch"].Value } else { 0 }
  }
}

function Compare-VersionObject {
  param(
    $Left,
    $Right
  )

  if ($Left.Major -ne $Right.Major) {
    return [Math]::Sign($Left.Major - $Right.Major)
  }

  if ($Left.Minor -ne $Right.Minor) {
    return [Math]::Sign($Left.Minor - $Right.Minor)
  }

  return [Math]::Sign($Left.Patch - $Right.Patch)
}

function Test-VersionComparator {
  param(
    $CurrentVersion,
    [string]$Token
  )

  $cleanToken = ([string]$Token).Trim()
  if ([string]::IsNullOrWhiteSpace($cleanToken)) {
    return [PSCustomObject]@{ Known = $true; Pass = $true }
  }

  if ($cleanToken -match "^(?<operator>>=|<=|>|<|=)\s*(?<version>.+)$") {
    $target = Parse-Version -Version $Matches["version"]
    if ($null -eq $target) {
      return [PSCustomObject]@{ Known = $false; Pass = $false }
    }

    $comparison = Compare-VersionObject $CurrentVersion $target
    switch ($Matches["operator"]) {
      ">=" { return [PSCustomObject]@{ Known = $true; Pass = ($comparison -ge 0) } }
      "<=" { return [PSCustomObject]@{ Known = $true; Pass = ($comparison -le 0) } }
      ">"  { return [PSCustomObject]@{ Known = $true; Pass = ($comparison -gt 0) } }
      "<"  { return [PSCustomObject]@{ Known = $true; Pass = ($comparison -lt 0) } }
      "="  { return [PSCustomObject]@{ Known = $true; Pass = ($comparison -eq 0) } }
    }
  }

  if ($cleanToken -match "^(?<major>\d+)(?:\.(?<minor>\d+|x|\*))?(?:\.(?<patch>\d+|x|\*))?$") {
    $major = [int]$Matches["major"]
    $minorToken = $Matches["minor"]
    $patchToken = $Matches["patch"]

    if ([string]::IsNullOrWhiteSpace($minorToken) -or $minorToken -in @("x", "*")) {
      return [PSCustomObject]@{ Known = $true; Pass = ($CurrentVersion.Major -eq $major) }
    }

    $minor = [int]$minorToken
    if ([string]::IsNullOrWhiteSpace($patchToken) -or $patchToken -in @("x", "*")) {
      return [PSCustomObject]@{ Known = $true; Pass = ($CurrentVersion.Major -eq $major -and $CurrentVersion.Minor -eq $minor) }
    }

    $patch = [int]$patchToken
    return [PSCustomObject]@{ Known = $true; Pass = ($CurrentVersion.Major -eq $major -and $CurrentVersion.Minor -eq $minor -and $CurrentVersion.Patch -eq $patch) }
  }

  return [PSCustomObject]@{ Known = $false; Pass = $false }
}

function Test-VersionRange {
  param(
    [string]$Version,
    [string]$Range
  )

  $currentVersion = Parse-Version -Version $Version
  if ($null -eq $currentVersion) {
    return [PSCustomObject]@{ Known = $false; Pass = $false }
  }

  $tokens = @(([string]$Range).Trim() -split "\s+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  foreach ($token in $tokens) {
    $tokenResult = Test-VersionComparator -CurrentVersion $currentVersion -Token $token
    if (-not $tokenResult.Known) {
      return [PSCustomObject]@{ Known = $false; Pass = $false }
    }

    if (-not $tokenResult.Pass) {
      return [PSCustomObject]@{ Known = $true; Pass = $false }
    }
  }

  return [PSCustomObject]@{ Known = $true; Pass = $true }
}

function Test-PathItem {
  param(
    [string]$Label,
    [string]$Path,
    [switch]$Required
  )

  if (Test-Path -LiteralPath $Path) {
    Write-Ok ("{0} encontrado em {1}" -f $Label, $Path)
    return $true
  }

  if ($Required) {
    Write-Fail ("{0} ausente em {1}" -f $Label, $Path)
  } else {
    Write-Warn ("{0} ausente em {1}" -f $Label, $Path)
  }

  return $false
}

function Show-PlannedCommand {
  param(
    [string]$Command,
    [bool]$WillRun
  )

  if ($WillRun) {
    Write-Host ("  [EXECUTAR] {0}" -f $Command) -ForegroundColor Yellow
  } else {
    Write-Host ("  [PLANO]    {0}" -f $Command) -ForegroundColor DarkGray
  }
}

function Confirm-Install {
  $answer = Read-Host "Confirma a instalacao das dependencias npm acima? Digite SIM para continuar"
  return $answer -ceq "SIM"
}

function Invoke-StepCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$DisplayCommand
  )

  Write-Host ("-> Executando: {0}" -f $DisplayCommand) -ForegroundColor Yellow
  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Falha ao executar: $DisplayCommand (exit $exitCode)"
  }

  Write-Ok ("Concluido: {0}" -f $DisplayCommand)
}

Write-Host ""
Write-Host "== DX-ENV-03 - Bootstrap assistido de dependencias ==" -ForegroundColor Cyan
Write-Host ("Projeto: {0}" -f $RepoRoot) -ForegroundColor DarkCyan

if ($InstallDeps) {
  Write-Info "Modo selecionado: instalacao assistida."
} else {
  Write-Info "Modo selecionado: dry-run/plano. Nenhuma instalacao sera executada."
}

Write-Section -Title "Pre-requisitos basicos"

$hasRootPackage = Test-PathItem -Label "package.json da raiz" -Path $RootPackagePath -Required
$hasRootLock = Test-PathItem -Label "package-lock.json da raiz" -Path $RootLockPath -Required
$hasFrontendPackage = Test-PathItem -Label "frontend/package.json" -Path $FrontendPackagePath -Required
$hasFrontendLock = Test-PathItem -Label "frontend/package-lock.json" -Path $FrontendLockPath -Required

if (Test-Path -LiteralPath $BackendPackagePath) {
  Write-Ok "backend/package.json encontrado."
  Write-Info "O bootstrap atual nao instala backend separado automaticamente."
  Write-Info "Se esse manifest passar a ser usado no futuro, o comando sugerido sera: npm.cmd --prefix backend install"
} else {
  Write-Info "backend/package.json nao existe no estado atual; backend usa o package.json da raiz."
}

$gitInfo = Invoke-CommandForVersion -Candidates @("git") -Arguments @("--version")
if ($gitInfo.Found -and -not $gitInfo.Error) {
  Write-Ok ("Git disponivel: {0}" -f $gitInfo.Output)
} elseif ($gitInfo.Found) {
  Write-Warn ("Git foi localizado, mas nao respondeu corretamente: {0}" -f $gitInfo.Error)
  Write-Info "Instale ou ajuste o Git manualmente antes de clonar/atualizar o repositorio."
} else {
  Write-Warn "Git nao encontrado no PATH."
  Write-Info "Instale o Git manualmente antes de clonar/atualizar o repositorio."
}

$nodeInfo = Invoke-CommandForVersion -Candidates @("node") -Arguments @("-v")
$npmInfo = Invoke-CommandForVersion -Candidates @("npm.cmd", "npm") -Arguments @("-v")

$rootPackageJson = Read-JsonFile -Path $RootPackagePath
$frontendPackageJson = Read-JsonFile -Path $FrontendPackagePath
$rootNodeEngine = $null
$frontendNodeEngine = $null

if ($null -ne $rootPackageJson -and $rootPackageJson.engines) {
  $rootNodeEngine = [string]$rootPackageJson.engines.node
}

if ($null -ne $frontendPackageJson -and $frontendPackageJson.engines) {
  $frontendNodeEngine = [string]$frontendPackageJson.engines.node
}

$nodeReady = $false
if ($nodeInfo.Found -and -not $nodeInfo.Error) {
  Write-Ok ("Node.js disponivel: {0}" -f $nodeInfo.Output)
  $nodeReady = $true
} elseif ($nodeInfo.Found) {
  Write-Fail ("Node.js foi localizado, mas nao respondeu corretamente: {0}" -f $nodeInfo.Error)
  Write-Info "Instale ou ajuste manualmente um Node.js LTS compativel com >=20 <23."
} else {
  Write-Fail "Node.js nao encontrado no PATH."
  Write-Info "Instale manualmente um Node.js LTS compativel com >=20 <23."
}

if ($nodeReady -and -not [string]::IsNullOrWhiteSpace($rootNodeEngine)) {
  $rootNodeRange = Test-VersionRange -Version $nodeInfo.Output -Range $rootNodeEngine
  if ($rootNodeRange.Known -and $rootNodeRange.Pass) {
    Write-Ok ("Node atende a faixa da raiz: {0}" -f $rootNodeEngine)
  } elseif ($rootNodeRange.Known) {
    Write-Fail ("Node {0} nao atende a faixa da raiz: {1}" -f $nodeInfo.Output, $rootNodeEngine)
    $nodeReady = $false
  } else {
    Write-Warn ("Nao foi possivel comparar Node {0} com a faixa da raiz: {1}" -f $nodeInfo.Output, $rootNodeEngine)
  }
}

if ($nodeReady -and -not [string]::IsNullOrWhiteSpace($frontendNodeEngine)) {
  $frontendNodeRange = Test-VersionRange -Version $nodeInfo.Output -Range $frontendNodeEngine
  if ($frontendNodeRange.Known -and $frontendNodeRange.Pass) {
    Write-Ok ("Node atende a faixa do frontend: {0}" -f $frontendNodeEngine)
  } elseif ($frontendNodeRange.Known) {
    Write-Fail ("Node {0} nao atende a faixa do frontend: {1}" -f $nodeInfo.Output, $frontendNodeEngine)
    $nodeReady = $false
  } else {
    Write-Warn ("Nao foi possivel comparar Node {0} com a faixa do frontend: {1}" -f $nodeInfo.Output, $frontendNodeEngine)
  }
}

$npmReady = $false
if ($npmInfo.Found -and -not $npmInfo.Error) {
  Write-Ok ("npm disponivel: {0}" -f $npmInfo.Output)
  $npmReady = $true
} elseif ($npmInfo.Found) {
  Write-Fail ("npm foi localizado, mas nao respondeu corretamente: {0}" -f $npmInfo.Error)
  Write-Info "Reinstale ou ajuste manualmente o Node.js para recuperar o npm."
} else {
  Write-Fail "npm nao encontrado no PATH."
  Write-Info "Reinstale ou ajuste manualmente o Node.js para recuperar o npm."
}

$doctorAvailable = Test-Path -LiteralPath $DoctorCmdPath
if ($doctorAvailable) {
  Write-Ok "env-doctor.cmd disponivel para diagnostico read-only."
} else {
  Write-Warn "env-doctor.cmd nao foi encontrado."
}

Write-Section -Title "Plano de bootstrap"

Write-Info "Comandos sugeridos para uma maquina nova:"
Show-PlannedCommand -Command "tests\scripts\env-doctor.cmd" -WillRun:$false
Show-PlannedCommand -Command "npm.cmd install" -WillRun:$InstallDeps
Show-PlannedCommand -Command "npm.cmd --prefix frontend install" -WillRun:$InstallDeps

if (Test-Path -LiteralPath $BackendPackagePath) {
  Show-PlannedCommand -Command "npm.cmd --prefix backend install" -WillRun:$false
}

Write-Host ""
Write-Info "O bootstrap nao instala Node, Git, Python, Build Tools, SQLite, winget ou browsers do Playwright."
Write-Info "O bootstrap nao roda build, smoke-auth, smoke-acesso ou E2E."

if (-not $InstallDeps) {
  Write-Section -Title "Resumo"
  Write-Ok "Dry-run concluido. Nenhuma instalacao foi executada."
  Write-Info "Para executar apenas as dependencias npm do projeto, rode: tests\scripts\env-bootstrap.cmd -InstallDeps"
  exit 0
}

Write-Section -Title "Validacao para instalacao"

$canInstall = $true
if (-not $hasRootPackage -or -not $hasRootLock) {
  $canInstall = $false
  Write-Fail "A instalacao da raiz foi bloqueada porque package.json/package-lock.json da raiz nao estao completos."
}

if (-not $hasFrontendPackage -or -not $hasFrontendLock) {
  $canInstall = $false
  Write-Fail "A instalacao do frontend foi bloqueada porque frontend/package.json/frontend/package-lock.json nao estao completos."
}

if (-not $nodeReady) {
  $canInstall = $false
  Write-Fail "A instalacao foi bloqueada porque Node.js nao esta pronto."
}

if (-not $npmReady) {
  $canInstall = $false
  Write-Fail "A instalacao foi bloqueada porque npm nao esta pronto."
}

if (-not $canInstall) {
  Write-Host ""
  Write-Info "Proximo passo recomendado: rode tests\scripts\env-doctor.cmd depois de corrigir os itens acima."
  exit 1
}

Write-Host ""
Write-Info "As instalacoes abaixo podem alterar apenas node_modules e artefatos npm locais."
Show-PlannedCommand -Command "npm.cmd install" -WillRun:$true
Show-PlannedCommand -Command "npm.cmd --prefix frontend install" -WillRun:$true

if (-not (Confirm-Install)) {
  Write-Host ""
  Write-Warn "Instalacao cancelada pelo usuario. Nenhuma dependencia foi instalada."
  exit 0
}

Write-Section -Title "Execucao"

$npmCommand = Get-CommandInfo -Candidates @("npm.cmd", "npm")
if ($null -eq $npmCommand) {
  Write-Fail "npm nao pode mais ser localizado no momento da execucao."
  exit 1
}

try {
  Invoke-StepCommand -FilePath $npmCommand.Source -Arguments @("install") -DisplayCommand "npm.cmd install"
  Invoke-StepCommand -FilePath $npmCommand.Source -Arguments @("--prefix", "frontend", "install") -DisplayCommand "npm.cmd --prefix frontend install"
} catch {
  Write-Fail $_.Exception.Message
  Write-Info "Proximo passo recomendado: revise o erro acima, corrija o ambiente e rode novamente tests\scripts\env-bootstrap.cmd -InstallDeps"
  exit 1
}

Write-Section -Title "Proximos passos"
Write-Ok "Bootstrap assistido concluido."
Write-Info "Agora rode o diagnostico read-only: tests\scripts\env-doctor.cmd"
Write-Info "Depois valide o gate principal manualmente: tests\scripts\smoke-auth.cmd, tests\scripts\smoke-acesso.cmd e npm.cmd --prefix frontend run build"
exit 0
