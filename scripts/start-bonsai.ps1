# Starts the local Bonsai-2 model server that powers Econ Coach (npm run bonsai).
#
# It wraps the launcher from PrismML's Bonsai-demo checkout, which picks the
# right llama.cpp binary, the model file and its vision projector (mmproj), and
# serves an OpenAI-compatible API on http://127.0.0.1:8080.
#
#   npm run bonsai                                   # Bonsai-2 4B (default)
#   $env:BONSAI_MODEL = "2B"; npm run bonsai         # smaller / faster
#   $env:BONSAI_MODEL = "9B"; npm run bonsai         # larger / slower
#
# Environment:
#   BONSAI_DIR    Bonsai-demo checkout          (default C:\bonsai\Bonsai-demo)
#   BONSAI_MODEL  2B | 4B | 9B                  (default 4B)
#   BONSAI_CTX    context window in tokens      (default 8192)
#   BONSAI_PIN    0 to skip keeping the model resident in RAM (default 1)
#   BONSAI_AFFINITY    0 to skip pinning model threads to cores on ARM64 (default 1)
#   BONSAI_LLAMA_ARGS  extra llama-server options, space separated
#
# Only Bonsai-2 2B / 4B / 9B are accepted on purpose: those are the models this
# project is allowed to use.
param(
    [string]$Model = $(if ($env:BONSAI_MODEL) { $env:BONSAI_MODEL } else { "4B" })
)

$ErrorActionPreference = "Stop"
$Port = 8080

$Model = $Model.ToUpperInvariant()
if ($Model -notin @("2B", "4B", "9B")) {
    Write-Host "[start-bonsai] BONSAI_MODEL must be 2B, 4B or 9B (got '$Model')." -ForegroundColor Red
    exit 1
}

$BonsaiDir = if ($env:BONSAI_DIR) { $env:BONSAI_DIR } else { "C:\bonsai\Bonsai-demo" }
$Launcher = Join-Path $BonsaiDir "scripts\start_llama_server.ps1"
$PinScript = Join-Path $PSScriptRoot "pin-bonsai.ps1"
$Pin = $env:BONSAI_PIN -ne "0"

# Already running? Then there is nothing to start; just (re)pin it.
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    if ($r.StatusCode -eq 200) {
        Write-Host "[start-bonsai] A model server is already answering on http://127.0.0.1:$Port."
        if ($Pin) { & $PinScript }
        exit 0
    }
} catch {}

if (-not (Test-Path $Launcher)) {
    Write-Host "[start-bonsai] Bonsai-demo was not found at $BonsaiDir." -ForegroundColor Red
    Write-Host "  1. git clone https://github.com/PrismML-Eng/Bonsai-demo $BonsaiDir"
    Write-Host "  2. cd $BonsaiDir; `$env:BONSAI_MODEL = '$Model'; .\setup.ps1"
    Write-Host "  Or point BONSAI_DIR at an existing checkout. See README.md."
    exit 1
}

$ModelDir = Join-Path $BonsaiDir "models\bonsai2-gguf\$Model"
if (-not (Get-ChildItem -Path $ModelDir -Filter *.gguf -File -ErrorAction SilentlyContinue)) {
    Write-Host "[start-bonsai] No Bonsai-2 $Model model files in $ModelDir." -ForegroundColor Red
    Write-Host "  Download them with:  cd $BonsaiDir; `$env:BONSAI_MODEL = '$Model'; .\setup.ps1"
    exit 1
}
if (-not (Get-ChildItem -Path $ModelDir -Filter *mmproj*.gguf -File -ErrorAction SilentlyContinue)) {
    Write-Host "[start-bonsai] Warning: no vision projector (mmproj) next to the model." -ForegroundColor Yellow
    Write-Host "               Handwriting recognition and problem screenshots need it."
}

$env:BONSAI_MODEL = $Model
$env:BONSAI_FAMILY = "bonsai2"
$env:BONSAI_THINKING = "0"   # short, direct tutor replies; no reasoning tokens
if (-not $env:BONSAI_CTX) { $env:BONSAI_CTX = "8192" }

# On a 16 GB laptop Windows pages the model out as soon as a browser gets busy,
# which makes it ~30x slower. A helper waits for the server to come up and asks
# Windows to keep it in RAM (no admin rights needed).
if ($Pin -and (Test-Path $PinScript)) {
    Start-Process -FilePath "powershell" -WindowStyle Hidden -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PinScript`"", "-WaitForHealth"
    ) | Out-Null
}

$ExtraArgs = @()

# The tutor keeps one cached system prompt per slot (hints, questions, long
# answers, vision). By default llama-server empties every idle slot whenever
# another slot starts work, so a hint that follows handwriting recognition had
# to re-read its whole 900-token system prompt (measured: 17.6 s instead of
# 2.7 s). Keep idle slots loaded; four short prompts fit easily in the context.
$ExtraArgs += "--no-cache-idle-slots"

# Windows on ARM laptops park half of their cores for about a minute when a
# heavy load starts. llama.cpp still runs one busy-waiting thread per core, so
# 12 threads fight over 6 cores and the model drops from ~70 to under 1 token
# per second (measured on a Snapdragon X Elite: a 5 s warm-up took 70 s).
# Pinning each thread to its own core makes Windows wake the parked cores.
# Only done on ARM64, where every logical processor is a physical core.
if ($env:BONSAI_AFFINITY -ne "0" -and $env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
    $Cores = [Environment]::ProcessorCount
    if ($Cores -ge 2 -and $Cores -le 64) { $ExtraArgs += @("-Cr", "0-$($Cores - 1)", "--cpu-strict", "1") }
}
if ($env:BONSAI_LLAMA_ARGS) { $ExtraArgs += @($env:BONSAI_LLAMA_ARGS -split '\s+' | Where-Object { $_ }) }

Write-Host "[start-bonsai] Starting Bonsai-2 $Model (context $($env:BONSAI_CTX)). First load takes about a minute."
if ($ExtraArgs.Count) { Write-Host "[start-bonsai] Extra llama-server options: $($ExtraArgs -join ' ')" }
Write-Host "[start-bonsai] Leave this window open; press Ctrl+C to stop the model."
& $Launcher @ExtraArgs
exit $LASTEXITCODE
