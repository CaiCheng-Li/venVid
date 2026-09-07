param(
    [string] $Checkout = (Join-Path (Split-Path $PSScriptRoot -Parent) 'Vencord')
)

$ErrorActionPreference = 'Stop'
$checkoutRoot = (Resolve-Path -LiteralPath $Checkout).Path
if (-not (Test-Path -LiteralPath (Join-Path $checkoutRoot 'src/webpack/common/utils.ts'))) {
    throw 'Checkout must point to a Vencord source checkout.'
}
$destination = Join-Path $checkoutRoot 'src/userplugins/venVid'
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot)
if ([IO.Path]::GetFullPath($destination).Equals($sourceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Source and build copy must be different directories.'
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
# Explicit file list: the build copy is disposable; edit only this repository.
$files = @('index.ts', 'patches.ts', 'attempt.ts', 'limits.ts', 'uploadAdapter.ts', 'CompressionModal.tsx', 'compression.ts', 'proofVideo.ts', 'styles.css', 'README.md', 'LICENSE', 'types.ts', 'native.ts', 'native')
foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $destination -Force -Recurse
}
Write-Output "Synced $($files.Count) plugin files to $destination"
