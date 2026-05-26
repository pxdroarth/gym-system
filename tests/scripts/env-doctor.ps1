param()

$ErrorActionPreference = "Stop"

$script:Results = New-Object System.Collections.ArrayList
$script:CountOk = 0
$script:CountWarn = 0
$script:CountFail = 0

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$RootPackagePath = Join-Path $RepoRoot "package.json"
$RootLockPath = Join-Path $RepoRoot "package-lock.json"
$FrontendPackagePath = Join-Path $RepoRoot "frontend\package.json"
$FrontendLockPath = Join-Path $RepoRoot "frontend\package-lock.json"
$BackendPackagePath = Join-Path $RepoRoot "backend\package.json"
$NativePackageNames = @("sqlite3", "better-sqlite3", "bcrypt", "sharp", "node-gyp", "canvas")

function Add-Result {
  param(
    [ValidateSet("OK", "WARN", "FAIL")]
    [string]$Status,
    [string]$Category,
    [string]$Check,
    [string]$Message,
    [string]$Suggestion
  )

  $color = "White"
  switch ($Status) {
    "OK" {
      $script:CountOk += 1
      $color = "Green"
    }
    "WARN" {
      $script:CountWarn += 1
      $color = "Yellow"
    }
    "FAIL" {
      $script:CountFail += 1
      $color = "Red"
    }
  }

  [void]$script:Results.Add([PSCustomObject]@{
      Status = $Status
      Category = $Category
      Check = $Check
      Message = $Message
      Suggestion = $Suggestion
    })

  Write-Host ("[{0}] [{1}] {2} - {3}" -f $Status, $Category, $Check, $Message) -ForegroundColor $color
  if (-not [string]::IsNullOrWhiteSpace($Suggestion)) {
    Write-Host ("       Sugestao: {0}" -f $Suggestion) -ForegroundColor DarkGray
  }
}

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host ("== {0} ==" -f $Title) -ForegroundColor Cyan
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

function Read-TextFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  return Get-Content -Raw -LiteralPath $Path
}

function Parse-Version {
  param([string]$Version)

  $normalized = ([string]$Version).Trim().Trim('"').TrimStart("v")
  $match = [regex]::Match($normalized, "^(?<major>\d+)(?:\.(?<minor>\d+))?(?:\.(?<patch>\d+))?")
  if (-not $match.Success) {
    return $null
  }

  return [PSCustomObject]@{
    Raw = $normalized
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
    return [PSCustomObject]@{
      Known = $true
      Pass = $true
    }
  }

  if ($cleanToken -match "^\^(?<version>.+)$") {
    $base = Parse-Version -Version $Matches["version"]
    if ($null -eq $base) {
      return [PSCustomObject]@{ Known = $false; Pass = $false }
    }

    $upper = [PSCustomObject]@{
      Raw = ""
      Major = $base.Major + 1
      Minor = 0
      Patch = 0
    }

    return [PSCustomObject]@{
      Known = $true
      Pass = ((Compare-VersionObject $CurrentVersion $base) -ge 0 -and (Compare-VersionObject $CurrentVersion $upper) -lt 0)
    }
  }

  if ($cleanToken -match "^~(?<version>.+)$") {
    $base = Parse-Version -Version $Matches["version"]
    if ($null -eq $base) {
      return [PSCustomObject]@{ Known = $false; Pass = $false }
    }

    $upper = [PSCustomObject]@{
      Raw = ""
      Major = $base.Major
      Minor = $base.Minor + 1
      Patch = 0
    }

    return [PSCustomObject]@{
      Known = $true
      Pass = ((Compare-VersionObject $CurrentVersion $base) -ge 0 -and (Compare-VersionObject $CurrentVersion $upper) -lt 0)
    }
  }

  if ($cleanToken -match "^(?<major>\d+)(?:\.(?<minor>\d+|x|\*))?(?:\.(?<patch>\d+|x|\*))?$") {
    $major = [int]$Matches["major"]
    $minorToken = $Matches["minor"]
    $patchToken = $Matches["patch"]

    if ([string]::IsNullOrWhiteSpace($minorToken)) {
      return [PSCustomObject]@{
        Known = $true
        Pass = ($CurrentVersion.Major -eq $major)
      }
    }

    if ($minorToken -in @("x", "*")) {
      return [PSCustomObject]@{
        Known = $true
        Pass = ($CurrentVersion.Major -eq $major)
      }
    }

    $minor = [int]$minorToken
    if ([string]::IsNullOrWhiteSpace($patchToken)) {
      return [PSCustomObject]@{
        Known = $true
        Pass = ($CurrentVersion.Major -eq $major -and $CurrentVersion.Minor -eq $minor)
      }
    }

    if ($patchToken -in @("x", "*")) {
      return [PSCustomObject]@{
        Known = $true
        Pass = ($CurrentVersion.Major -eq $major -and $CurrentVersion.Minor -eq $minor)
      }
    }

    $patch = [int]$patchToken
    return [PSCustomObject]@{
      Known = $true
      Pass = ($CurrentVersion.Major -eq $major -and $CurrentVersion.Minor -eq $minor -and $CurrentVersion.Patch -eq $patch)
    }
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

  return [PSCustomObject]@{
    Known = $false
    Pass = $false
  }
}

function Test-VersionRange {
  param(
    [string]$Version,
    [string]$Range
  )

  $currentVersion = Parse-Version -Version $Version
  if ($null -eq $currentVersion) {
    return [PSCustomObject]@{
      Known = $false
      Pass = $false
    }
  }

  $clauses = ([string]$Range).Trim() -split "\s*\|\|\s*"
  foreach ($clause in $clauses) {
    $allTokensPassed = $true
    $tokens = @($clause -split "\s+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    foreach ($token in $tokens) {
      $tokenResult = Test-VersionComparator -CurrentVersion $currentVersion -Token $token
      if (-not $tokenResult.Known) {
        return [PSCustomObject]@{
          Known = $false
          Pass = $false
        }
      }

      if (-not $tokenResult.Pass) {
        $allTokensPassed = $false
        break
      }
    }

    if ($allTokensPassed) {
      return [PSCustomObject]@{
        Known = $true
        Pass = $true
      }
    }
  }

  return [PSCustomObject]@{
    Known = $true
    Pass = $false
  }
}

function Format-RelativePath {
  param([string]$Path)

  $root = [string]$RepoRoot
  if ($Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $Path.Substring($root.Length).TrimStart("\")
  }

  return $Path
}

function Format-Bytes {
  param([long]$Length)

  if ($Length -lt 1KB) {
    return "$Length B"
  }

  if ($Length -lt 1MB) {
    return ("{0:N1} KB" -f ($Length / 1KB))
  }

  if ($Length -lt 1GB) {
    return ("{0:N1} MB" -f ($Length / 1MB))
  }

  return ("{0:N1} GB" -f ($Length / 1GB))
}

function Get-SuggestionPrefix {
  param(
    [string]$WingetCommand,
    [string]$ManualText
  )

  $winget = Get-CommandInfo -Candidates @("winget")
  if ($null -ne $winget -and -not [string]::IsNullOrWhiteSpace($WingetCommand)) {
    return $WingetCommand
  }

  return $ManualText
}

function Test-FilePresence {
  param(
    [string]$Category,
    [string]$Check,
    [string]$Path,
    [string]$MissingStatus,
    [string]$MissingSuggestion
  )

  if (Test-Path -LiteralPath $Path) {
    Add-Result -Status "OK" -Category $Category -Check $Check -Message ("Encontrado em {0}." -f (Format-RelativePath -Path $Path)) -Suggestion $null
    return $true
  }

  Add-Result -Status $MissingStatus -Category $Category -Check $Check -Message ("Ausente em {0}." -f (Format-RelativePath -Path $Path)) -Suggestion $MissingSuggestion
  return $false
}

function Get-PortState {
  param([int]$Port)

  $getNetTcpConnection = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
  if ($null -ne $getNetTcpConnection) {
    try {
      $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
      if ($connections) {
        $connection = $connections | Select-Object -First 1
        $processName = $null
        try {
          $processName = (Get-Process -Id $connection.OwningProcess -ErrorAction Stop).ProcessName
        } catch {
          $processName = $null
        }

        return [PSCustomObject]@{
          Known = $true
          Occupied = $true
          ProcessId = $connection.OwningProcess
          ProcessName = $processName
        }
      }

      return [PSCustomObject]@{
        Known = $true
        Occupied = $false
        ProcessId = $null
        ProcessName = $null
      }
    } catch {
      return [PSCustomObject]@{
        Known = $false
        Occupied = $null
        ProcessId = $null
        ProcessName = $null
      }
    }
  }

  try {
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    $occupied = $listeners | Where-Object { $_.Port -eq $Port } | Select-Object -First 1
    return [PSCustomObject]@{
      Known = $true
      Occupied = ($null -ne $occupied)
      ProcessId = $null
      ProcessName = $null
    }
  } catch {
    return [PSCustomObject]@{
      Known = $false
      Occupied = $null
      ProcessId = $null
      ProcessName = $null
    }
  }
}

Write-Host ""
Write-Host "== DX-ENV-01 - Dependency & Environment Doctor ==" -ForegroundColor Cyan
Write-Host ("Projeto: {0}" -f $RepoRoot) -ForegroundColor DarkCyan

Write-Section -Title "Sistema/base"

$platformName = if ($PSVersionTable.Platform) { [string]$PSVersionTable.Platform } else { [System.Environment]::OSVersion.Platform.ToString() }
$isWindows = $env:OS -eq "Windows_NT" -or $platformName -match "Win"
$osDescription = if ($PSVersionTable.OS) { [string]$PSVersionTable.OS } else { [System.Environment]::OSVersion.VersionString }
if ($isWindows) {
  Add-Result -Status "OK" -Category "Sistema/base" -Check "Plataforma" -Message ("Windows detectado: {0}" -f $osDescription) -Suggestion $null
} else {
  Add-Result -Status "WARN" -Category "Sistema/base" -Check "Plataforma" -Message ("Plataforma nao-Windows detectada: {0}. Os wrappers .cmd e parte do fluxo operacional atual assumem Windows." -f $osDescription) -Suggestion "Use um PowerShell compativel e adapte a execucao manual dos scripts .ps1 quando necessario."
}

$psVersion = $PSVersionTable.PSVersion
if ($psVersion.Major -gt 5 -or ($psVersion.Major -eq 5 -and $psVersion.Minor -ge 1)) {
  Add-Result -Status "OK" -Category "Sistema/base" -Check "PowerShell" -Message ("Versao {0}" -f $psVersion) -Suggestion $null
} else {
  Add-Result -Status "FAIL" -Category "Sistema/base" -Check "PowerShell" -Message ("Versao {0} abaixo do minimo pratico para os scripts atuais." -f $psVersion) -Suggestion "Atualize para Windows PowerShell 5.1+ ou PowerShell 7+."
}

$rootSignals = @(
  (Join-Path $RepoRoot "package.json"),
  (Join-Path $RepoRoot "frontend"),
  (Join-Path $RepoRoot "backend"),
  (Join-Path $RepoRoot "tests\scripts")
)
$missingSignals = @($rootSignals | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missingSignals.Count -eq 0) {
  Add-Result -Status "OK" -Category "Sistema/base" -Check "Raiz do projeto" -Message ("Raiz detectada corretamente em {0}" -f $RepoRoot) -Suggestion $null
} else {
  Add-Result -Status "FAIL" -Category "Sistema/base" -Check "Raiz do projeto" -Message ("A raiz resolvida nao contem todos os caminhos esperados: {0}" -f (($missingSignals | ForEach-Object { Format-RelativePath -Path $_ }) -join ", ")) -Suggestion "Rode o doctor a partir do repositorio correto ou reposicione os arquivos em tests\\scripts."
}

$gitInfo = Invoke-CommandForVersion -Candidates @("git") -Arguments @("--version")
if (-not $gitInfo.Found) {
  Add-Result -Status "FAIL" -Category "Sistema/base" -Check "Git" -Message "Git nao encontrado no PATH." -Suggestion (Get-SuggestionPrefix -WingetCommand "winget install --id Git.Git -e" -ManualText "Instale o Git para Windows manualmente antes de clonar ou versionar alteracoes.")
} elseif ($gitInfo.Error) {
  Add-Result -Status "WARN" -Category "Sistema/base" -Check "Git" -Message ("Git foi localizado, mas nao respondeu corretamente ({0})." -f $gitInfo.Error) -Suggestion "Abra um novo terminal e valide com: git --version"
} else {
  Add-Result -Status "OK" -Category "Sistema/base" -Check "Git" -Message $gitInfo.Output -Suggestion $null
}

$curlInfo = Invoke-CommandForVersion -Candidates @("curl.exe") -Arguments @("--version")
if (-not $curlInfo.Found) {
  Add-Result -Status "WARN" -Category "Sistema/base" -Check "curl.exe" -Message "curl.exe nao encontrado. O doctor nao depende dele, mas validacoes manuais externas podem depender." -Suggestion "Se precisar, valide com: curl.exe --version"
} elseif ($curlInfo.Error) {
  Add-Result -Status "WARN" -Category "Sistema/base" -Check "curl.exe" -Message ("curl.exe foi localizado, mas nao respondeu corretamente ({0})." -f $curlInfo.Error) -Suggestion "Abra um novo terminal e valide com: curl.exe --version"
} else {
  Add-Result -Status "OK" -Category "Sistema/base" -Check "curl.exe" -Message (($curlInfo.Output -split "\r?\n")[0]) -Suggestion $null
}

$wingetInfo = Invoke-CommandForVersion -Candidates @("winget") -Arguments @("--version")
if (-not $wingetInfo.Found) {
  Add-Result -Status "WARN" -Category "Sistema/base" -Check "winget" -Message "winget nao encontrado. As sugestoes de instalacao ficarao manuais." -Suggestion "Se quiser usar instalacao por linha de comando, habilite o App Installer/winget no Windows."
} elseif ($wingetInfo.Error) {
  Add-Result -Status "WARN" -Category "Sistema/base" -Check "winget" -Message ("winget foi localizado, mas nao respondeu corretamente ({0})." -f $wingetInfo.Error) -Suggestion "Abra um novo terminal e valide com: winget --version"
} else {
  Add-Result -Status "OK" -Category "Sistema/base" -Check "winget" -Message $wingetInfo.Output -Suggestion $null
}

Write-Section -Title "Runtime Node/npm"

$rootPackageJson = Read-JsonFile -Path $RootPackagePath
$frontendPackageJson = Read-JsonFile -Path $FrontendPackagePath

$rootNodeEngine = $null
$rootNpmEngine = $null
$frontendNodeEngine = $null
$frontendNpmEngine = $null

if ($null -ne $rootPackageJson -and $rootPackageJson.engines) {
  $rootNodeEngine = [string]$rootPackageJson.engines.node
  $rootNpmEngine = [string]$rootPackageJson.engines.npm
}

if ($null -ne $frontendPackageJson -and $frontendPackageJson.engines) {
  $frontendNodeEngine = [string]$frontendPackageJson.engines.node
  $frontendNpmEngine = [string]$frontendPackageJson.engines.npm
}

$nodeInfo = Invoke-CommandForVersion -Candidates @("node") -Arguments @("-v")
if (-not $nodeInfo.Found) {
  $expectedNode = @($rootNodeEngine, $frontendNodeEngine) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
  $expectedNodeText = if ($expectedNode.Count -gt 0) { " Faixas detectadas: $($expectedNode -join ', ')." } else { "" }
  Add-Result -Status "FAIL" -Category "Runtime Node/npm" -Check "Node.js" -Message ("Node.js nao encontrado no PATH.{0}" -f $expectedNodeText) -Suggestion (Get-SuggestionPrefix -WingetCommand "winget install OpenJS.NodeJS.LTS" -ManualText "Instale manualmente o Node.js LTS em https://nodejs.org/ e abra um novo terminal.")
} elseif ($nodeInfo.Error) {
  Add-Result -Status "FAIL" -Category "Runtime Node/npm" -Check "Node.js" -Message ("Node.js foi localizado, mas nao respondeu corretamente ({0})." -f $nodeInfo.Error) -Suggestion "Abra um novo terminal e valide com: node -v"
} else {
  Add-Result -Status "OK" -Category "Runtime Node/npm" -Check "Node.js" -Message ("Versao detectada: {0}" -f $nodeInfo.Output) -Suggestion $null
}

$npmInfo = Invoke-CommandForVersion -Candidates @("npm.cmd", "npm") -Arguments @("-v")
if (-not $npmInfo.Found) {
  $expectedNpm = @($rootNpmEngine, $frontendNpmEngine) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
  $expectedNpmText = if ($expectedNpm.Count -gt 0) { " Faixas detectadas: $($expectedNpm -join ', ')." } else { "" }
  Add-Result -Status "FAIL" -Category "Runtime Node/npm" -Check "npm" -Message ("npm nao encontrado no PATH.{0}" -f $expectedNpmText) -Suggestion "Reinstale o Node.js LTS para receber o npm junto, depois valide com: npm.cmd -v"
} elseif ($npmInfo.Error) {
  Add-Result -Status "FAIL" -Category "Runtime Node/npm" -Check "npm" -Message ("npm foi localizado, mas nao respondeu corretamente ({0})." -f $npmInfo.Error) -Suggestion "Abra um novo terminal e valide com: npm.cmd -v"
} else {
  Add-Result -Status "OK" -Category "Runtime Node/npm" -Check "npm" -Message ("Versao detectada: {0}" -f $npmInfo.Output) -Suggestion $null
}

if ([string]::IsNullOrWhiteSpace($rootNodeEngine)) {
  Add-Result -Status "WARN" -Category "Runtime Node/npm" -Check "engines.node (raiz)" -Message "package.json da raiz nao declara engines.node." -Suggestion "Documente a faixa minima/recomendada em package.json ou em um bloco futuro de DX."
} else {
  Add-Result -Status "OK" -Category "Runtime Node/npm" -Check "engines.node (raiz)" -Message ("Faixa declarada: {0}" -f $rootNodeEngine) -Suggestion $null
}

if ([string]::IsNullOrWhiteSpace($frontendNodeEngine)) {
  Add-Result -Status "WARN" -Category "Runtime Node/npm" -Check "engines.node (frontend)" -Message "frontend/package.json nao declara engines.node." -Suggestion "Documente a faixa minima/recomendada em frontend/package.json ou em um bloco futuro de DX."
} else {
  Add-Result -Status "OK" -Category "Runtime Node/npm" -Check "engines.node (frontend)" -Message ("Faixa declarada: {0}" -f $frontendNodeEngine) -Suggestion $null
}

if ($nodeInfo.Found -and -not $nodeInfo.Error -and -not [string]::IsNullOrWhiteSpace($rootNodeEngine)) {
  $rootNodeRange = Test-VersionRange -Version $nodeInfo.Output -Range $rootNodeEngine
  if (-not $rootNodeRange.Known) {
    Add-Result -Status "WARN" -Category "Runtime Node/npm" -Check "Compatibilidade Node x raiz" -Message ("Nao foi possivel comparar a versao {0} com a faixa '{1}'." -f $nodeInfo.Output, $rootNodeEngine) -Suggestion "Revise manualmente com: node -v"
  } elseif ($rootNodeRange.Pass) {
    Add-Result -Status "OK" -Category "Runtime Node/npm" -Check "Compatibilidade Node x raiz" -Message ("Node {0} atende a faixa {1}." -f $nodeInfo.Output, $rootNodeEngine) -Suggestion $null
  } else {
    Add-Result -Status "FAIL" -Category "Runtime Node/npm" -Check "Compatibilidade Node x raiz" -Message ("Node {0} nao atende a faixa {1}." -f $nodeInfo.Output, $rootNodeEngine) -Suggestion (Get-SuggestionPrefix -WingetCommand "winget install OpenJS.NodeJS.LTS" -ManualText "Ajuste manualmente para uma versao Node.js LTS compativel com a faixa declarada.")
  }
}

if ($nodeInfo.Found -and -not $nodeInfo.Error -and -not [string]::IsNullOrWhiteSpace($frontendNodeEngine)) {
  $frontendNodeRange = Test-VersionRange -Version $nodeInfo.Output -Range $frontendNodeEngine
  if (-not $frontendNodeRange.Known) {
    Add-Result -Status "WARN" -Category "Runtime Node/npm" -Check "Compatibilidade Node x frontend" -Message ("Nao foi possivel comparar a versao {0} com a faixa '{1}'." -f $nodeInfo.Output, $frontendNodeEngine) -Suggestion "Revise manualmente com: node -v"
  } elseif ($frontendNodeRange.Pass) {
    Add-Result -Status "OK" -Category "Runtime Node/npm" -Check "Compatibilidade Node x frontend" -Message ("Node {0} atende a faixa {1}." -f $nodeInfo.Output, $frontendNodeEngine) -Suggestion $null
  } else {
    Add-Result -Status "FAIL" -Category "Runtime Node/npm" -Check "Compatibilidade Node x frontend" -Message ("Node {0} nao atende a faixa {1}." -f $nodeInfo.Output, $frontendNodeEngine) -Suggestion (Get-SuggestionPrefix -WingetCommand "winget install OpenJS.NodeJS.LTS" -ManualText "Ajuste manualmente para uma versao Node.js LTS compativel com a faixa declarada.")
  }
}

Write-Section -Title "Estrutura do projeto"

[void](Test-FilePresence -Category "Estrutura do projeto" -Check "package.json da raiz" -Path $RootPackagePath -MissingStatus "FAIL" -MissingSuggestion "Restaure o arquivo package.json na raiz do repositorio.")
[void](Test-FilePresence -Category "Estrutura do projeto" -Check "package-lock.json da raiz" -Path $RootLockPath -MissingStatus "FAIL" -MissingSuggestion "Restaure ou gere novamente package-lock.json na raiz com o lock esperado.")
[void](Test-FilePresence -Category "Estrutura do projeto" -Check "frontend/package.json" -Path $FrontendPackagePath -MissingStatus "FAIL" -MissingSuggestion "Restaure frontend\\package.json.")
[void](Test-FilePresence -Category "Estrutura do projeto" -Check "frontend/package-lock.json" -Path $FrontendLockPath -MissingStatus "WARN" -MissingSuggestion "Gere o lock do frontend com: npm.cmd --prefix frontend install")

if (Test-Path -LiteralPath $BackendPackagePath) {
  Add-Result -Status "OK" -Category "Estrutura do projeto" -Check "backend/package.json" -Message "Arquivo proprio do backend encontrado." -Suggestion $null
} else {
  Add-Result -Status "OK" -Category "Estrutura do projeto" -Check "backend/package.json" -Message "Nao existe backend/package.json; o backend usa o package.json da raiz." -Suggestion $null
}

foreach ($directory in @("backend", "frontend", "tests\scripts")) {
  $fullDirectory = Join-Path $RepoRoot $directory
  if (Test-Path -LiteralPath $fullDirectory) {
    Add-Result -Status "OK" -Category "Estrutura do projeto" -Check ("Pasta {0}" -f $directory) -Message "Diretorio encontrado." -Suggestion $null
  } else {
    Add-Result -Status "FAIL" -Category "Estrutura do projeto" -Check ("Pasta {0}" -f $directory) -Message "Diretorio ausente." -Suggestion ("Restaure a pasta {0} a partir do repositorio." -f $directory)
  }
}

[void](Test-FilePresence -Category "Estrutura do projeto" -Check "tests\\scripts\\smoke-auth.cmd" -Path (Join-Path $RepoRoot "tests\scripts\smoke-auth.cmd") -MissingStatus "FAIL" -MissingSuggestion "Restaure tests\\scripts\\smoke-auth.cmd.")
[void](Test-FilePresence -Category "Estrutura do projeto" -Check "tests\\scripts\\smoke-acesso.cmd" -Path (Join-Path $RepoRoot "tests\scripts\smoke-acesso.cmd") -MissingStatus "FAIL" -MissingSuggestion "Restaure tests\\scripts\\smoke-acesso.cmd.")

Write-Section -Title "Dependencias Node instaladas"

$rootNodeModulesPath = Join-Path $RepoRoot "node_modules"
if (Test-Path -LiteralPath $rootNodeModulesPath) {
  Add-Result -Status "OK" -Category "Dependencias Node instaladas" -Check "node_modules da raiz" -Message "Diretorio encontrado." -Suggestion $null
} else {
  Add-Result -Status "FAIL" -Category "Dependencias Node instaladas" -Check "node_modules da raiz" -Message "Diretorio ausente." -Suggestion "Execute manualmente: npm.cmd install"
}

$frontendNodeModulesPath = Join-Path $RepoRoot "frontend\node_modules"
if (Test-Path -LiteralPath $frontendNodeModulesPath) {
  Add-Result -Status "OK" -Category "Dependencias Node instaladas" -Check "frontend/node_modules" -Message "Diretorio encontrado." -Suggestion $null
} else {
  Add-Result -Status "FAIL" -Category "Dependencias Node instaladas" -Check "frontend/node_modules" -Message "Diretorio ausente." -Suggestion "Execute manualmente: npm.cmd --prefix frontend install"
}

if (Test-Path -LiteralPath $BackendPackagePath) {
  $backendNodeModulesPath = Join-Path $RepoRoot "backend\node_modules"
  if (Test-Path -LiteralPath $backendNodeModulesPath) {
    Add-Result -Status "OK" -Category "Dependencias Node instaladas" -Check "backend/node_modules" -Message "Diretorio encontrado." -Suggestion $null
  } else {
    Add-Result -Status "FAIL" -Category "Dependencias Node instaladas" -Check "backend/node_modules" -Message "Diretorio ausente." -Suggestion "Execute manualmente: npm.cmd --prefix backend install"
  }
} else {
  Add-Result -Status "OK" -Category "Dependencias Node instaladas" -Check "backend/node_modules" -Message "Nao aplicavel porque o backend usa dependencias da raiz." -Suggestion $null
}

Write-Section -Title "Dependencias nativas potenciais"

$nativeMatches = @{}
foreach ($path in @($RootPackagePath, $RootLockPath, $FrontendPackagePath, $FrontendLockPath, $BackendPackagePath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    continue
  }

  $content = Read-TextFile -Path $path
  if ($null -eq $content) {
    continue
  }

  foreach ($packageName in $NativePackageNames) {
    if ($content -match ('"' + [regex]::Escape($packageName) + '"')) {
      if (-not $nativeMatches.ContainsKey($packageName)) {
        $nativeMatches[$packageName] = New-Object System.Collections.ArrayList
      }

      [void]$nativeMatches[$packageName].Add((Format-RelativePath -Path $path))
    }
  }
}

if ($nativeMatches.Count -eq 0) {
  Add-Result -Status "OK" -Category "Dependencias nativas potenciais" -Check "Pacotes nativos comuns" -Message "Nenhum pacote nativo comum foi detectado nos manifests inspecionados." -Suggestion $null
} else {
  $nativeSummary = @()
  foreach ($key in ($nativeMatches.Keys | Sort-Object)) {
    $nativeSummary += ("{0} ({1})" -f $key, (($nativeMatches[$key] | Select-Object -Unique) -join ", "))
  }

  Add-Result -Status "WARN" -Category "Dependencias nativas potenciais" -Check "Pacotes nativos comuns" -Message ("Foram detectados pacotes que podem exigir binarios/toolchain: {0}" -f ($nativeSummary -join "; ")) -Suggestion "Valide Python e Build Tools antes de reinstalar dependencias em uma maquina nova."

  $pythonInfo = Invoke-CommandForVersion -Candidates @("py.exe", "python.exe", "python") -Arguments @("--version")
  if (-not $pythonInfo.Found) {
    Add-Result -Status "WARN" -Category "Dependencias nativas potenciais" -Check "Python" -Message "Python nao foi encontrado no PATH." -Suggestion (Get-SuggestionPrefix -WingetCommand "winget install Python.Python.3.12" -ManualText "Instale manualmente o Python 3 para reduzir risco ao compilar dependencias nativas.")
  } elseif ($pythonInfo.Error) {
    Add-Result -Status "WARN" -Category "Dependencias nativas potenciais" -Check "Python" -Message ("Python foi localizado, mas nao respondeu corretamente ({0})." -f $pythonInfo.Error) -Suggestion "Abra um novo terminal e valide com: py -3 --version"
  } else {
    Add-Result -Status "OK" -Category "Dependencias nativas potenciais" -Check "Python" -Message ($pythonInfo.Output -replace "\s+", " ") -Suggestion $null
  }

  $clInfo = Get-Command "cl.exe" -ErrorAction SilentlyContinue
  if ($null -ne $clInfo) {
    Add-Result -Status "OK" -Category "Dependencias nativas potenciais" -Check "Build Tools C++" -Message ("cl.exe encontrado em {0}" -f $clInfo.Source) -Suggestion $null
  } else {
    $vswherePath = $null
    if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) {
      $vswherePath = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    }

    if ($vswherePath -and (Test-Path -LiteralPath $vswherePath)) {
      try {
        $vsDisplayName = (& $vswherePath -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property displayName 2>$null | Select-Object -First 1)
        if (-not [string]::IsNullOrWhiteSpace([string]$vsDisplayName)) {
          Add-Result -Status "OK" -Category "Dependencias nativas potenciais" -Check "Build Tools C++" -Message ("Instalacao detectada: {0}" -f ([string]$vsDisplayName).Trim()) -Suggestion $null
        } else {
          Add-Result -Status "WARN" -Category "Dependencias nativas potenciais" -Check "Build Tools C++" -Message "Nao foi encontrada uma instalacao com toolchain C++ via vswhere." -Suggestion (Get-SuggestionPrefix -WingetCommand "winget install Microsoft.VisualStudio.2022.BuildTools" -ManualText "Instale manualmente o Visual Studio Build Tools com C++ se a reinstalacao de dependencias nativas falhar.")
        }
      } catch {
        Add-Result -Status "WARN" -Category "Dependencias nativas potenciais" -Check "Build Tools C++" -Message "Nao foi possivel validar com seguranca as Build Tools via vswhere." -Suggestion "Revise manualmente a instalacao do Visual Studio Build Tools com C++."
      }
    } else {
      Add-Result -Status "WARN" -Category "Dependencias nativas potenciais" -Check "Build Tools C++" -Message "Nao foi possivel detectar com seguranca as Build Tools C++ nesta maquina." -Suggestion "Revise manualmente a instalacao do Visual Studio Build Tools com C++ se a reinstalacao de dependencias nativas falhar."
    }
  }
}

Write-Section -Title "Banco/local runtime"

$knownDbCandidates = @(
  (Join-Path $RepoRoot "backend\academia.sqlite"),
  (Join-Path $RepoRoot "backend\seubanco.db")
)

$existingDbCandidates = @()
foreach ($dbPath in $knownDbCandidates) {
  if (Test-Path -LiteralPath $dbPath) {
    $existingDbCandidates += $dbPath
  }
}

if ($existingDbCandidates.Count -eq 0) {
  $fallbackDbCandidates = Get-ChildItem -Path (Join-Path $RepoRoot "backend") -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Extension -in @(".sqlite", ".db")
  }
  foreach ($item in $fallbackDbCandidates) {
    $existingDbCandidates += $item.FullName
  }
}

if ($existingDbCandidates.Count -eq 0) {
  Add-Result -Status "WARN" -Category "Banco/local runtime" -Check "SQLite local" -Message "Nenhum arquivo de banco local conhecido foi encontrado em backend." -Suggestion "Leia docs\\setup\\ambiente-local.md e, se necessario, inicie manualmente o backend com: npm.cmd run backend"
} else {
  $dbInfos = @()
  $hasUsableDb = $false
  foreach ($dbPath in ($existingDbCandidates | Select-Object -Unique)) {
    $item = Get-Item -LiteralPath $dbPath -ErrorAction SilentlyContinue
    if ($null -eq $item) {
      continue
    }

    $dbInfos += ("{0} ({1})" -f (Format-RelativePath -Path $item.FullName), (Format-Bytes -Length $item.Length))
    if ($item.Length -gt 0) {
      $hasUsableDb = $true
    }
  }

  if ($hasUsableDb) {
    Add-Result -Status "OK" -Category "Banco/local runtime" -Check "SQLite local" -Message ("Arquivo(s) detectado(s): {0}" -f ($dbInfos -join "; ")) -Suggestion $null
  } else {
    Add-Result -Status "WARN" -Category "Banco/local runtime" -Check "SQLite local" -Message ("Arquivos encontrados, mas vazios: {0}" -f ($dbInfos -join "; ")) -Suggestion "Confira se o bootstrap local foi executado e, se necessario, inicie manualmente o backend com: npm.cmd run backend"
  }
}

Write-Section -Title "Variaveis de ambiente"

$envChecks = @(
  @{ Label = ".env da raiz"; Path = (Join-Path $RepoRoot ".env"); ExamplePath = (Join-Path $RepoRoot ".env.example") },
  @{ Label = "backend/.env"; Path = (Join-Path $RepoRoot "backend\.env"); ExamplePath = (Join-Path $RepoRoot "backend\.env.example") },
  @{ Label = "frontend/.env"; Path = (Join-Path $RepoRoot "frontend\.env"); ExamplePath = (Join-Path $RepoRoot "frontend\.env.example") }
)

foreach ($envCheck in $envChecks) {
  $envExists = Test-Path -LiteralPath $envCheck.Path
  $exampleExists = Test-Path -LiteralPath $envCheck.ExamplePath

  if ($envExists) {
    Add-Result -Status "OK" -Category "Variaveis de ambiente" -Check $envCheck.Label -Message "Arquivo presente (conteudo nao exibido)." -Suggestion $null
  } elseif ($exampleExists) {
    Add-Result -Status "WARN" -Category "Variaveis de ambiente" -Check $envCheck.Label -Message ("Arquivo ausente, mas existe modelo em {0}." -f (Format-RelativePath -Path $envCheck.ExamplePath)) -Suggestion ("Copie manualmente o modelo: Copy-Item `"{0}`" `"{1}`"" -f (Format-RelativePath -Path $envCheck.ExamplePath), (Format-RelativePath -Path $envCheck.Path))
  } else {
    Add-Result -Status "WARN" -Category "Variaveis de ambiente" -Check $envCheck.Label -Message "Arquivo e modelo nao foram encontrados." -Suggestion "Revise a documentacao local para confirmar se esse escopo precisa de variaveis de ambiente."
  }

  if ($exampleExists) {
    Add-Result -Status "OK" -Category "Variaveis de ambiente" -Check ($envCheck.Label + ".example") -Message "Arquivo de exemplo presente." -Suggestion $null
  } else {
    Add-Result -Status "WARN" -Category "Variaveis de ambiente" -Check ($envCheck.Label + ".example") -Message "Arquivo de exemplo ausente." -Suggestion "Adicione ou restaure um .env.example para orientar o setup local."
  }
}

Write-Section -Title "Portas esperadas"

$portChecks = @(
  @{ Port = 3001; Label = "Backend"; SuggestedStart = "npm.cmd run backend" },
  @{ Port = 5173; Label = "Frontend"; SuggestedStart = "npm.cmd --prefix frontend run dev" }
)

foreach ($portCheck in $portChecks) {
  $portState = Get-PortState -Port $portCheck.Port
  if (-not $portState.Known) {
    Add-Result -Status "WARN" -Category "Portas esperadas" -Check ("Porta {0}" -f $portCheck.Port) -Message "Nao foi possivel verificar a ocupacao da porta com seguranca." -Suggestion ("Valide manualmente antes de subir o servico: {0}" -f $portCheck.SuggestedStart)
    continue
  }

  if (-not $portState.Occupied) {
    Add-Result -Status "OK" -Category "Portas esperadas" -Check ("Porta {0}" -f $portCheck.Port) -Message ("Livre para uso do {0}." -f $portCheck.Label.ToLowerInvariant()) -Suggestion $null
    continue
  }

  $ownerSummary = if ($portState.ProcessId) {
    if ($portState.ProcessName) {
      "PID $($portState.ProcessId) ($($portState.ProcessName))"
    } else {
      "PID $($portState.ProcessId)"
    }
  } else {
    "processo nao identificado"
  }

  Add-Result -Status "WARN" -Category "Portas esperadas" -Check ("Porta {0}" -f $portCheck.Port) -Message ("Ja esta ocupada por {0}." -f $ownerSummary) -Suggestion ("Revise o processo atual antes de iniciar o {0}." -f $portCheck.Label.ToLowerInvariant())
}

Write-Section -Title "Scripts/package.json"

if ($null -eq $rootPackageJson) {
  Add-Result -Status "FAIL" -Category "Scripts/package.json" -Check "Leitura do package.json da raiz" -Message "Nao foi possivel ler package.json da raiz como JSON." -Suggestion "Revise a sintaxe de package.json."
} else {
  Add-Result -Status "OK" -Category "Scripts/package.json" -Check "Leitura do package.json da raiz" -Message "Manifest lido com sucesso via PowerShell." -Suggestion $null
}

if ($null -eq $frontendPackageJson) {
  Add-Result -Status "FAIL" -Category "Scripts/package.json" -Check "Leitura do frontend/package.json" -Message "Nao foi possivel ler frontend/package.json como JSON." -Suggestion "Revise a sintaxe de frontend\\package.json."
} else {
  Add-Result -Status "OK" -Category "Scripts/package.json" -Check "Leitura do frontend/package.json" -Message "Manifest lido com sucesso via PowerShell." -Suggestion $null
}

$rootScripts = $null
if ($null -ne $rootPackageJson) {
  $rootScripts = $rootPackageJson.scripts
}

$frontendScripts = $null
if ($null -ne $frontendPackageJson) {
  $frontendScripts = $frontendPackageJson.scripts
}

if ($null -ne $frontendScripts -and -not [string]::IsNullOrWhiteSpace([string]$frontendScripts.build)) {
  Add-Result -Status "OK" -Category "Scripts/package.json" -Check "Script frontend build" -Message ("frontend/package.json define o script build: {0}" -f [string]$frontendScripts.build) -Suggestion $null
} else {
  Add-Result -Status "FAIL" -Category "Scripts/package.json" -Check "Script frontend build" -Message "frontend/package.json nao define o script build, que faz parte do gate atual." -Suggestion "Adicione ou restaure o script build em frontend\\package.json."
}

if ($null -ne $rootScripts -and -not [string]::IsNullOrWhiteSpace([string]$rootScripts.e2e)) {
  Add-Result -Status "OK" -Category "Scripts/package.json" -Check "Script e2e" -Message ("package.json da raiz define `e2e`: {0}" -f [string]$rootScripts.e2e) -Suggestion $null
} else {
  Add-Result -Status "WARN" -Category "Scripts/package.json" -Check "Script e2e" -Message "Nenhum script e2e foi encontrado na raiz. Isso nao bloqueia a readiness atual porque Playwright esta opcional/pausado." -Suggestion "Quando o gate E2E voltar a ser obrigatorio, adicione um script e2e consistente."
}

$playwrightDeclared = $false
if ($null -ne $rootPackageJson -and $rootPackageJson.devDependencies) {
  $playwrightDeclared = -not [string]::IsNullOrWhiteSpace([string]$rootPackageJson.devDependencies.'@playwright/test')
}
if ($playwrightDeclared) {
  Add-Result -Status "OK" -Category "Scripts/package.json" -Check "Playwright" -Message "Dependencia @playwright/test declarada na raiz; tratada como opcional/pausada neste doctor." -Suggestion $null
} else {
  Add-Result -Status "WARN" -Category "Scripts/package.json" -Check "Playwright" -Message "Dependencia @playwright/test nao foi detectada na raiz. Isso nao gera FAIL no doctor atual." -Suggestion "Reveja a dependencia quando o gate E2E voltar a bloquear readiness."
}

foreach ($smokeName in @("smoke-auth.cmd", "smoke-acesso.cmd")) {
  $smokePath = Join-Path $RepoRoot ("tests\scripts\" + $smokeName)
  if (Test-Path -LiteralPath $smokePath) {
    Add-Result -Status "OK" -Category "Scripts/package.json" -Check ("Wrapper {0}" -f $smokeName) -Message "Script operacional presente." -Suggestion $null
  } else {
    Add-Result -Status "FAIL" -Category "Scripts/package.json" -Check ("Wrapper {0}" -f $smokeName) -Message "Script operacional ausente." -Suggestion ("Restaure tests\\scripts\\{0}." -f $smokeName)
  }
}

Write-Section -Title "Resumo final"

$overallStatus = "READY"
if ($script:CountFail -gt 0) {
  $overallStatus = "NOT_READY"
} elseif ($script:CountWarn -gt 0) {
  $overallStatus = "READY_WITH_WARNINGS"
}

Write-Host ("OK: {0}" -f $script:CountOk) -ForegroundColor Green
Write-Host ("WARN: {0}" -f $script:CountWarn) -ForegroundColor Yellow
Write-Host ("FAIL: {0}" -f $script:CountFail) -ForegroundColor Red
Write-Host ("STATUS_GERAL: {0}" -f $overallStatus) -ForegroundColor Cyan

$actionableItems = @($script:Results | Where-Object {
    $_.Status -in @("WARN", "FAIL") -and -not [string]::IsNullOrWhiteSpace($_.Suggestion)
  })

if ($actionableItems.Count -gt 0) {
  Write-Host ""
  Write-Host "Acoes sugeridas (nao executadas):" -ForegroundColor Cyan
  foreach ($item in $actionableItems) {
    Write-Host ("- [{0}] {1}: {2}" -f $item.Status, $item.Check, $item.Suggestion) -ForegroundColor DarkGray
  }
}

Write-Host ""
if ($script:CountFail -gt 0) {
  exit 1
}

exit 0
