<#
.SYNOPSIS
  x64 setup for A5 PII Anonymizer multilingual redesign - Phases 9 & 10.
  Run this on an x64 Windows machine (NOT win-arm64: PyTorch has no arm64 wheel).

.DESCRIPTION
  Phase 9 - export Babelscape/wikineural-multilingual-ner to ONNX (quantized) and
            place it where transformers.js expects it; flip the model id in source.
  Phase 10 - npm install, ensure sharp/libvips DLLs are present, build the installer.

  Idempotent where practical. Each phase can be skipped.

.PARAMETER RepoRoot
  Repo root. Defaults to the parent of this script's folder.

.PARAMETER SkipExport   Skip Phase 9 (model export).
.PARAMETER SkipBuild    Skip Phase 10 (npm install + electron-builder).
.PARAMETER KeepFp32     Keep the full-precision onnx/model.onnx (~700MB) in addition to the quantized one.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\setup-x64.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\setup-x64.ps1 -SkipBuild
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
  [switch]$SkipExport,
  [switch]$SkipBuild,
  [switch]$KeepFp32
)

$ErrorActionPreference = 'Stop'
function Section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Info($t)    { Write-Host "  $t" -ForegroundColor Gray }
function Ok($t)      { Write-Host "  OK: $t" -ForegroundColor Green }
function Die($t)     { Write-Host "  ERROR: $t" -ForegroundColor Red; exit 1 }
function Exec($cmd) { Info "> $cmd"; & ([scriptblock]::Create($cmd)); if ($LASTEXITCODE -ne 0) { Die "command failed (exit $LASTEXITCODE): $cmd" } }

# torch pinned to an available, not-newest wheel (2.5.1 was dropped for py3.11 on the
# runner; pip offered 2.9.0..2.12.0). optimum/transformers left unpinned so pip resolves
# a combo compatible with torch 2.9.x (the export CLI is stable across these).
$PIP_OPTIMUM      = 'optimum[onnxruntime]'
$PIP_TRANSFORMERS = 'transformers'
$PIP_TORCH        = 'torch==2.9.1'
$MODEL_ID         = 'Babelscape/wikineural-multilingual-ner'
$MODEL_REL        = 'models/Babelscape/wikineural-multilingual-ner'
$LIBVIPS_URL      = 'https://github.com/lovell/sharp-libvips/releases/download/v8.14.5/libvips-8.14.5-win32-x64.tar.gz'
$LIBVIPS_SHA512   = 'aZApEGTey9XV0PqjDcdKNzOfLmxuqmyMn5/PXm3AQ0NzGGYCDZvtkD6LVH1A1zUFGa2L/VqrqAdpCWjk4Fs8Ow=='
$LIBVIPS_DLLS     = @('libvips-42.dll','libglib-2.0-0.dll','libgobject-2.0-0.dll')

if (-not (Test-Path (Join-Path $RepoRoot 'fileProcessor.js'))) { Die "RepoRoot does not look like the repo: $RepoRoot" }
Section "Repo: $RepoRoot"

# --- architecture guard -------------------------------------------------------
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -match 'ARM64') { Die "This is an ARM64 host. PyTorch has no win-arm64 wheel; run on an x64 machine." }
Ok "architecture: $arch"

# =============================================================================
# PHASE 9 - WikiNeural -> ONNX (quantized)
# =============================================================================
if (-not $SkipExport) {
  Section "Phase 9: export $MODEL_ID to ONNX"

  # locate a Python launcher
  $py = $null
  foreach ($cand in @('py','python','python3')) {
    $c = Get-Command $cand -ErrorAction SilentlyContinue
    if ($c) { $py = $c.Source; break }
  }
  if (-not $py) { Die "Python not found. Install Python 3.10/3.11 x64 from python.org and re-run." }
  Info "python: $py"

  $venv = Join-Path $RepoRoot '.venv-export'
  $vpy  = Join-Path $venv 'Scripts\python.exe'
  if (-not (Test-Path $vpy)) {
    Info "creating venv at $venv"
    Exec "& `"$py`" -m venv `"$venv`""
  } else { Info "reusing venv $venv" }

  Exec "& `"$vpy`" -m pip install --upgrade pip"
  Info "installing optimum/transformers/torch (large download ~2.5GB for torch; be patient)"
  Exec "& `"$vpy`" -m pip install `"$PIP_OPTIMUM`" `"$PIP_TRANSFORMERS`" `"$PIP_TORCH`""

  $tmp = Join-Path $RepoRoot '.export-tmp'
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  $optimum = Join-Path $venv 'Scripts\optimum-cli.exe'

  Info "exporting (this downloads the model and runs the ONNX export)"
  Exec "& `"$optimum`" export onnx --model $MODEL_ID --task token-classification `"$tmp`""

  # Arrange into the transformers.js layout: <MODEL_REL>/{config,tokenizer,...} and <MODEL_REL>/onnx/model*.onnx
  $finalDir = Join-Path $RepoRoot $MODEL_REL
  $onnxDir  = Join-Path $finalDir 'onnx'
  New-Item -ItemType Directory -Force $onnxDir | Out-Null

  # copy tokenizer/config files (everything that is not the onnx blob)
  Get-ChildItem $tmp -File | Where-Object { $_.Extension -ne '.onnx' } | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $finalDir $_.Name) -Force
  }
  # move model.onnx into onnx/
  $srcOnnx = Get-ChildItem $tmp -Recurse -Filter 'model.onnx' | Select-Object -First 1
  if (-not $srcOnnx) { Die "export produced no model.onnx in $tmp" }
  Copy-Item $srcOnnx.FullName (Join-Path $onnxDir 'model.onnx') -Force
  # external-data file (large models): copy if present
  Get-ChildItem $tmp -Recurse -Filter '*.onnx_data' -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $onnxDir $_.Name) -Force
  }

  Info "quantizing to int8 -> onnx/model_quantized.onnx"
  Exec "& `"$optimum`" onnxruntime quantize --avx2 --onnx_model `"$onnxDir`" -o `"$onnxDir`""

  if (-not (Test-Path (Join-Path $onnxDir 'model_quantized.onnx'))) { Die "quantization did not produce model_quantized.onnx" }
  if (-not $KeepFp32) {
    Remove-Item (Join-Path $onnxDir 'model.onnx') -Force -ErrorAction SilentlyContinue
    Get-ChildItem $onnxDir -Filter '*.onnx_data' -ErrorAction SilentlyContinue | Remove-Item -Force
    Info "removed full-precision model.onnx (use -KeepFp32 to retain)"
  }
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

  # verify required files for transformers.js token-classification
  $need = @('config.json','tokenizer.json','tokenizer_config.json')
  foreach ($f in $need) { if (-not (Test-Path (Join-Path $finalDir $f))) { Die "missing $f in $finalDir" } }
  if (-not (Test-Path (Join-Path $finalDir 'vocab.txt'))) { Info "note: vocab.txt absent (ok if tokenizer.json is self-contained)" }
  Ok "model laid out at $MODEL_REL (onnx/model_quantized.onnx present)"

  # --- flip the model id + make load deterministic in fileProcessor.js --------
  $fp = Join-Path $RepoRoot 'fileProcessor.js'
  $txt = Get-Content $fp -Raw
  $orig = $txt
  $txt = $txt -replace "// TODO\(Phase 9\): switch to 'Babelscape/wikineural-multilingual-ner'\r?\n\s*", ''
  $txt = $txt.Replace(
    "pipeline('token-classification', 'protectai/lakshyakh93-deberta_finetuned_pii-onnx')",
    "pipeline('token-classification', '$MODEL_ID', { quantized: true })")
  $txt = $txt.Replace('env.quantized = false;', 'env.quantized = true;')
  if ($txt -ne $orig) {
    Set-Content -Path $fp -Value $txt -Encoding utf8 -NoNewline
    Ok "fileProcessor.js: model id -> $MODEL_ID, quantized load enabled"
  } elseif ($txt -match [regex]::Escape($MODEL_ID)) {
    Info "fileProcessor.js already points at $MODEL_ID (no change)"
  } else {
    Info "WARN: could not find the expected old model-id string to replace - edit fileProcessor.js by hand"
  }

  Write-Host "  NOTE: the model is large. Track it with git-lfs before committing:" -ForegroundColor Yellow
  Write-Host "        git lfs install; git lfs track 'models/**/*.onnx'; git add .gitattributes" -ForegroundColor Yellow
} else { Section "Phase 9 skipped (-SkipExport)" }

# =============================================================================
# PHASE 10 - install deps, ensure libvips DLLs, build installer
# =============================================================================
if (-not $SkipBuild) {
  Section "Phase 10: build installer"

  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) { Die "Node.js/npm not found. Install Node LTS (x64) from nodejs.org and re-run (or: winget install OpenJS.NodeJS.LTS)." }
  Info "node: $((& node --version)); npm: $((& npm --version))"

  Push-Location $RepoRoot
  try {
    Exec "npm install"

    # ensure sharp/libvips runtime DLLs (the upstream packaging bug)
    $release = Join-Path $RepoRoot 'node_modules\sharp\build\Release'
    if (-not (Test-Path $release)) { Die "sharp not installed at $release - check npm install output" }
    $missing = @($LIBVIPS_DLLS | Where-Object { -not (Test-Path (Join-Path $release $_)) })
    if ($missing.Count -gt 0) {
      Info "missing libvips DLLs: $($missing -join ', ') - fetching verified tarball"
      $dl = Join-Path $env:TEMP 'libvips-8.14.5-win32-x64.tar.gz'
      Exec "curl.exe -sL -o `"$dl`" `"$LIBVIPS_URL`""
      $sha = [Convert]::ToBase64String([System.Security.Cryptography.SHA512]::Create().ComputeHash([System.IO.File]::ReadAllBytes($dl)))
      if ($sha -ne $LIBVIPS_SHA512) { Die "libvips tarball sha512 mismatch - refusing to use. got=$sha" }
      Ok "libvips sha512 verified"
      $ex = Join-Path $env:TEMP 'libvips-x64'; if (Test-Path $ex) { Remove-Item -Recurse -Force $ex }
      New-Item -ItemType Directory -Force $ex | Out-Null
      Exec "tar.exe -xzf `"$dl`" -C `"$ex`""
      foreach ($d in $LIBVIPS_DLLS) {
        $src = Get-ChildItem $ex -Recurse -Filter $d | Select-Object -First 1
        if (-not $src) { Die "DLL $d not found in libvips tarball" }
        Copy-Item $src.FullName (Join-Path $release $d) -Force
      }
      Ok "copied missing libvips DLLs into sharp\build\Release"
    } else { Ok "libvips DLLs already present" }

    Info "building Windows installer (electron-builder)"
    Exec "npx electron-builder --win"

    $dist = Join-Path $RepoRoot 'dist'
    $exe = Get-ChildItem $dist -Recurse -Filter '*.exe' -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 1
    if ($exe) { Ok "installer built: $($exe.FullName)" } else { Info "build finished; check $dist for output" }
  } finally { Pop-Location }
} else { Section "Phase 10 skipped (-SkipBuild)" }

Section "Done"
Write-Host "Next:" -ForegroundColor Gray
Write-Host "  1. Run the engine tests (any machine with Node):  node --test test/" -ForegroundColor Gray
Write-Host "  2. Install the built .exe (dist\) and process a Russian PDF end-to-end:" -ForegroundColor Gray
Write-Host "     confirm name/address/bank/email replaced, body text intact, and a" -ForegroundColor Gray
Write-Host "     <output>.mapping.json written next to the output." -ForegroundColor Gray
Write-Host "  3. Before release: set DEV_FORCE_PRO = false in fileProcessor.js." -ForegroundColor Gray
Write-Host "  4. Commit model via git-lfs (see note above) or distribute out-of-band." -ForegroundColor Gray
