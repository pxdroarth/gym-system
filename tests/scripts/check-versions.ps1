param()

$ErrorActionPreference = "Stop"
$script:RequiredFailure = $false
$RecommendedNpmMajor = 10

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

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

function Get-TrimmedFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  return ((Get-Content -Raw -LiteralPath $Path) -as [string]).Trim()
}

function Invoke-VersionCommand {
  param(
    [string]$Label,
    [string[]]$Candidates,
    [string[]]$Arguments,
    [switch]$Required
  )

  foreach ($candidate in $Candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($null -eq $command) {
      continue
    }

    try {
      $previousErrorActionPreference = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      try {
        $output = & $command.Source @Arguments 2>&1
        if ($LASTEXITCODE -ne 0) {
          throw "exit $LASTEXITCODE"
        }
      } finally {
        $ErrorActionPreference = $previousErrorActionPreference
      }

      $summary = (($output | Select-Object -First 1) -as [string]).Trim()
      if ([string]::IsNullOrWhiteSpace($summary)) {
        Write-Ok "$Label disponivel."
      } else {
        Write-Ok "$Label - $summary"
      }

      return [PSCustomObject]@{
        Found = $true
        Command = $command.Source
        Output = $summary
      }
    } catch {
      continue
    }
  }

  if ($Required) {
    Write-Fail "$Label nao encontrado ou indisponivel."
  } else {
    Write-Warn "$Label nao encontrado ou indisponivel."
  }

  return [PSCustomObject]@{
    Found = $false
    Command = $null
    Output = $null
  }
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Fail "$Path ausente."
    return $null
  }

  try {
    return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
  } catch {
    Write-Fail "$Path invalido ou ilegivel como JSON."
    return $null
  }
}

function Test-EnginesNode {
  param(
    [string]$Label,
    [string]$Path
  )

  $json = Read-JsonFile -Path $Path
  if ($null -eq $json) {
    return
  }

  if ($json.engines -and -not [string]::IsNullOrWhiteSpace([string]$json.engines.node)) {
    Write-Ok "$Label possui engines.node = $($json.engines.node)."
  } else {
    Write-Fail "$Label nao possui engines.node."
  }

  if ($json.engines -and -not [string]::IsNullOrWhiteSpace([string]$json.engines.npm)) {
    Write-Ok "$Label possui engines.npm = $($json.engines.npm)."
  } else {
    Write-Warn "$Label nao possui engines.npm."
  }
}

function Get-MajorVersion {
  param([string]$Version)
  $normalized = ([string]$Version).Trim().TrimStart("v")
  $match = [regex]::Match($normalized, "^(\d+)")
  if (-not $match.Success) {
    return $null
  }

  return [int]$match.Groups[1].Value
}

Write-Host ""
Write-Host "== Check Versions - Sistema Academia SA ==" -ForegroundColor Cyan
Write-Host ""

$nvmrcPath = Join-Path $RepoRoot ".nvmrc"
$nodeVersionPath = Join-Path $RepoRoot ".node-version"
$rootPackagePath = Join-Path $RepoRoot "package.json"
$frontendPackagePath = Join-Path $RepoRoot "frontend\package.json"
$rootLockPath = Join-Path $RepoRoot "package-lock.json"
$frontendLockPath = Join-Path $RepoRoot "frontend\package-lock.json"

$nvmrc = Get-TrimmedFile -Path $nvmrcPath
$nodeVersion = Get-TrimmedFile -Path $nodeVersionPath

if ([string]::IsNullOrWhiteSpace($nvmrc)) {
  Write-Fail ".nvmrc ausente ou vazio."
} else {
  Write-Ok ".nvmrc encontrado: $nvmrc"
}

if ([string]::IsNullOrWhiteSpace($nodeVersion)) {
  Write-Fail ".node-version ausente ou vazio."
} else {
  Write-Ok ".node-version encontrado: $nodeVersion"
}

if (-not [string]::IsNullOrWhiteSpace($nvmrc) -and -not [string]::IsNullOrWhiteSpace($nodeVersion)) {
  if ($nvmrc -eq $nodeVersion) {
    Write-Ok ".nvmrc e .node-version sao identicos."
  } else {
    Write-Fail ".nvmrc e .node-version possuem valores diferentes."
  }
}

$node = Invoke-VersionCommand -Label "Node.js" -Candidates @("node") -Arguments @("-v") -Required
$npm = Invoke-VersionCommand -Label "npm" -Candidates @("npm.cmd", "npm") -Arguments @("-v") -Required
$git = Invoke-VersionCommand -Label "Git" -Candidates @("git") -Arguments @("--version") -Required

if ($node.Found -and -not [string]::IsNullOrWhiteSpace($nvmrc)) {
  $currentNode = ([string]$node.Output).TrimStart("v")
  $currentNodeMajor = Get-MajorVersion -Version $currentNode

  if ($null -eq $currentNodeMajor) {
    Write-Fail "Nao foi possivel identificar a major version do Node atual ($currentNode)."
  } elseif ($currentNodeMajor -lt 20) {
    Write-Fail "Node atual ($currentNode) esta abaixo da faixa suportada >=20 <23."
  } elseif ($currentNodeMajor -ge 23) {
    Write-Fail "Node atual ($currentNode) esta acima da faixa suportada >=20 <23."
  } else {
    if ($currentNode -eq $nvmrc) {
      Write-Ok "Node atual ($currentNode) esta dentro da faixa suportada >=20 <23 e corresponde a versao recomendada."
    } else {
      Write-Ok "Node atual ($currentNode) esta dentro da faixa suportada >=20 <23."
      Write-Warn "Node atual ($currentNode) difere da versao recomendada em .nvmrc ($nvmrc)."
    }
  }
}

if ($npm.Found) {
  $currentNpm = ([string]$npm.Output).Trim()
  $currentNpmMajor = Get-MajorVersion -Version $currentNpm

  if ($null -eq $currentNpmMajor) {
    Write-Fail "Nao foi possivel identificar a major version do npm atual ($currentNpm)."
  } elseif ($currentNpmMajor -lt 9) {
    Write-Fail "npm atual ($currentNpm) esta abaixo da faixa suportada >=9."
  } else {
    Write-Ok "npm atual ($currentNpm) esta dentro da faixa suportada >=9."
    if ($currentNpmMajor -ne $RecommendedNpmMajor) {
      Write-Warn "npm atual ($currentNpm) difere da major detectada anteriormente ($RecommendedNpmMajor.x), mas esta dentro da faixa suportada."
    }
  }
}

Test-EnginesNode -Label "package.json da raiz" -Path $rootPackagePath

if (Test-Path -LiteralPath $frontendPackagePath) {
  Test-EnginesNode -Label "frontend/package.json" -Path $frontendPackagePath
} else {
  Write-Warn "frontend/package.json nao encontrado; validacao do frontend ignorada."
}

if (Test-Path -LiteralPath $rootLockPath) {
  Write-Ok "package-lock.json da raiz encontrado."
} else {
  Write-Fail "package-lock.json da raiz ausente."
}

if (Test-Path -LiteralPath $frontendPackagePath) {
  if (Test-Path -LiteralPath $frontendLockPath) {
    Write-Ok "frontend/package-lock.json encontrado."
  } else {
    Write-Fail "frontend/package-lock.json ausente."
  }
}

Invoke-VersionCommand -Label "Java opcional para PlantUML" -Candidates @("java") -Arguments @("-version") | Out-Null
Invoke-VersionCommand -Label "Graphviz dot opcional para PlantUML" -Candidates @("dot") -Arguments @("-V") | Out-Null

Write-Host ""

if ($script:RequiredFailure) {
  Write-Host "Resultado: versoes ou arquivos obrigatorios precisam de ajuste." -ForegroundColor Red
  exit 1
}

Write-Host "Resultado: verificacao de versoes concluida." -ForegroundColor Green
exit 0
