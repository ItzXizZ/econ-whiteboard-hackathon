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

Write-Host "[start-bonsai] Starting Bonsai-2 $Model (context $($env:BONSAI_CTX)). First load takes about a minute."
Write-Host "[start-bonsai] Leave this window open; press Ctrl+C to stop the model."
& $Launcher
exit $LASTEXITCODE
