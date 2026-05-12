param(
  [string]$BaseUrl = "http://localhost:3001",
  [Parameter(Mandatory = $true)]
  [string]$Login,
  [string]$Senha,
  [string]$UnitId = "1"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

if ([string]::IsNullOrWhiteSpace($Senha)) {
  $secure = Read-Host "Senha" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $Senha = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Ok {
  param([string]$Name)
  Write-Host "[OK] $Name" -ForegroundColor Green
}

function Fail {
  param([string]$Name, [string]$Message)
  Write-Host "[FALHOU] $Name - $Message" -ForegroundColor Red
  exit 1
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers = @{},
    $Body = $null,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null
  )

  try {
    $params = @{
      Method = $Method
      Uri = $Url
      Headers = $Headers
      UseBasicParsing = $true
    }

    if ($Session -ne $null) {
      $params.WebSession = $Session
    }

    if ($Body -ne $null) {
      $params.ContentType = "application/json"
      $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }

    $res = Invoke-WebRequest @params

    return [PSCustomObject]@{
      Status = [int]$res.StatusCode
      Body = $res.Content
      Headers = $res.Headers
    }
  } catch {
    $resp = $_.Exception.Response

    if ($resp -ne $null) {
      $status = [int]$resp.StatusCode
      $content = ""

      try {
        $stream = $resp.GetResponseStream()
        if ($stream -ne $null) {
          $reader = New-Object System.IO.StreamReader($stream)
          $content = $reader.ReadToEnd()
        }
      } catch {
        $content = ""
      }

      return [PSCustomObject]@{
        Status = $status
        Body = $content
        Headers = @{}
      }
    }

    throw
  }
}

function Parse-Json {
  param([string]$Body)

  try {
    if ([string]::IsNullOrWhiteSpace($Body)) {
      return $null
    }

    return $Body | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-AccessToken {
  param($Json)

  if ($Json -eq $null) {
    return $null
  }

  if ($Json.token) {
    return [string]$Json.token
  }

  if ($Json.access_token) {
    return [string]$Json.access_token
  }

  if ($Json.data -and $Json.data.token) {
    return [string]$Json.data.token
  }

  if ($Json.data -and $Json.data.access_token) {
    return [string]$Json.data.access_token
  }

  return $null
}

function Assert-Status {
  param([string]$Name, [int]$Actual, [int]$Expected)

  if ($Actual -ne $Expected) {
    Fail $Name "status $Actual, esperado $Expected"
  }

  Ok $Name
}

function Login-And-GetToken {
  param(
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
    [string]$Label
  )

  $body = @{
    login = $Login
    senha = $Senha
  }

  $res = Invoke-Api -Method "POST" -Url "$BaseUrl/auth/login" -Body $body -Session $Session
  Assert-Status "$Label login" $res.Status 200

  $json = Parse-Json $res.Body
  $token = Get-AccessToken $json

  if ([string]::IsNullOrWhiteSpace($token)) {
    Fail "$Label login" "token nao encontrado na resposta"
  }

  $setCookie = ""
  if ($res.Headers.ContainsKey("Set-Cookie")) {
    $setCookie = ($res.Headers["Set-Cookie"] -join "; ")
  }

  if ($setCookie -notmatch "academia_sa_refresh") {
    Fail "$Label cookie" "cookie academia_sa_refresh nao encontrado"
  }

  if ($setCookie -notmatch "HttpOnly") {
    Fail "$Label cookie" "cookie nao veio com HttpOnly"
  }

  Ok "$Label cookie HttpOnly"

  return $token
}

Write-Host ""
Write-Host "== Smoke Test Auth - Sistema Academia SA ==" -ForegroundColor Cyan
Write-Host "BaseUrl: $BaseUrl"
Write-Host ""

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$res = Invoke-Api -Method "GET" -Url "$BaseUrl/test-db"
Assert-Status "/test-db" $res.Status 200

$token1 = Login-And-GetToken -Session $session -Label "primeiro"

$headers1 = @{
  Authorization = "Bearer $token1"
  "X-Unit-Id" = $UnitId
}

$res = Invoke-Api -Method "GET" -Url "$BaseUrl/auth/me" -Headers $headers1 -Session $session
Assert-Status "/auth/me com TOKEN_1" $res.Status 200

$res = Invoke-Api -Method "POST" -Url "$BaseUrl/auth/refresh" -Session $session
Assert-Status "/auth/refresh" $res.Status 200

$json = Parse-Json $res.Body
$token2 = Get-AccessToken $json

if ([string]::IsNullOrWhiteSpace($token2)) {
  Fail "/auth/refresh" "novo token nao encontrado na resposta"
}

Ok "novo access token recebido"

$headersOld = @{
  Authorization = "Bearer $token1"
  "X-Unit-Id" = $UnitId
}

$res = Invoke-Api -Method "GET" -Url "$BaseUrl/auth/me" -Headers $headersOld -Session $session
Assert-Status "TOKEN_1 invalido apos refresh" $res.Status 401

$headers2 = @{
  Authorization = "Bearer $token2"
  "X-Unit-Id" = $UnitId
}

$res = Invoke-Api -Method "GET" -Url "$BaseUrl/auth/me" -Headers $headers2 -Session $session
Assert-Status "/auth/me com TOKEN_2" $res.Status 200

$res = Invoke-Api -Method "POST" -Url "$BaseUrl/auth/logout" -Headers $headers2 -Session $session
Assert-Status "/auth/logout" $res.Status 200

$res = Invoke-Api -Method "GET" -Url "$BaseUrl/auth/me" -Headers $headers2 -Session $session
Assert-Status "TOKEN_2 invalido apos logout" $res.Status 401

$sessionA = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$sessionB = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$tokenA = Login-And-GetToken -Session $sessionA -Label "sessao A"
$tokenB = Login-And-GetToken -Session $sessionB -Label "sessao B"

$headersB = @{
  Authorization = "Bearer $tokenB"
  "X-Unit-Id" = $UnitId
}

$res = Invoke-Api -Method "POST" -Url "$BaseUrl/auth/logout-all" -Headers $headersB -Session $sessionB
Assert-Status "/auth/logout-all" $res.Status 200

$headersA = @{
  Authorization = "Bearer $tokenA"
  "X-Unit-Id" = $UnitId
}

$res = Invoke-Api -Method "GET" -Url "$BaseUrl/auth/me" -Headers $headersA -Session $sessionA
Assert-Status "TOKEN_A invalido apos logout-all" $res.Status 401

$res = Invoke-Api -Method "GET" -Url "$BaseUrl/auth/me" -Headers $headersB -Session $sessionB
Assert-Status "TOKEN_B invalido apos logout-all" $res.Status 401

Write-Host ""
Write-Host "Smoke test finalizado com sucesso." -ForegroundColor Green
exit 0