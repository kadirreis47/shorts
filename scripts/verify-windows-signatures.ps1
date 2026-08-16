param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw | ConvertFrom-Json
$productName = [string]$package.build.productName
$version = [string]$package.version
if ([string]::IsNullOrWhiteSpace($productName) -or [string]::IsNullOrWhiteSpace($version)) {
  throw 'Public Windows release signature verification requires package productName and version.'
}

$artifacts = @(
  (Join-Path $repositoryRoot (Join-Path 'release\win-unpacked' "$productName.exe")),
  (Join-Path $repositoryRoot (Join-Path 'release' "$productName Setup $version.exe"))
)

$results = foreach ($artifact in $artifacts) {
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
    throw "Required public release artifact is missing: $(Split-Path -Leaf $artifact)"
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $artifact
  [pscustomobject]@{
    artifact = $artifact
    status = [string]$signature.Status
    signerPresent = ($null -ne $signature.SignerCertificate)
  }
}

$results | ConvertTo-Json -Compress
