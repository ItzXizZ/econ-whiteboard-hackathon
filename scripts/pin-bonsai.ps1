# Keeps the Bonsai llama-server responsive on a busy 16 GB laptop.
#
# On CPU the model only runs at full speed while its weights + KV cache stay in
# physical RAM. When Chrome/IDE/etc. have the machine over-committed, Windows
# trims llama-server's working set and every token turns into thousands of hard
# page faults (measured: 0.7 tok/s instead of ~20+ tok/s). This script asks
# Windows to keep a minimum working set resident for llama-server and bumps its
# priority one notch. It needs no admin rights and changes nothing on disk.
#
#   powershell -ExecutionPolicy Bypass -File scripts/pin-bonsai.ps1            # pin now
#   powershell -ExecutionPolicy Bypass -File scripts/pin-bonsai.ps1 -WaitForHealth
param(
    [switch]$WaitForHealth,
    [int]$MinMB = $(if ($env:BONSAI_PIN_MB) { [int]$env:BONSAI_PIN_MB } else { 3072 }),
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

if ($WaitForHealth) {
    $deadline = (Get-Date).AddMinutes(10)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
            if ($r.StatusCode -eq 200) { break }
        } catch {}
        Start-Sleep -Seconds 2
    }
}

if (-not ("Bonsai.Mem" -as [type])) {
    Add-Type -Namespace Bonsai -Name Mem -MemberDefinition @"
[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool SetProcessWorkingSetSizeEx(IntPtr hProcess, UIntPtr dwMin, UIntPtr dwMax, uint flags);
"@
}

# QUOTA_LIMITS_HARDWS_MIN_ENABLE (0x1) | QUOTA_LIMITS_HARDWS_MAX_DISABLE (0x8)
$flags = 0x1 -bor 0x8
$procs = @(Get-Process -Name "llama-server" -ErrorAction SilentlyContinue)
if ($procs.Count -eq 0) {
    Write-Host "[pin-bonsai] llama-server is not running; nothing to pin."
    exit 0
}

foreach ($p in $procs) {
    $min = [UIntPtr]::new([uint64]$MinMB * 1MB)
    $max = [UIntPtr]::new([uint64]([Math]::Max($MinMB * 2, 8192)) * 1MB)
    $ok = [Bonsai.Mem]::SetProcessWorkingSetSizeEx($p.Handle, $min, $max, $flags)
    if ($ok) {
        Write-Host "[pin-bonsai] pid $($p.Id): minimum working set pinned to $MinMB MB"
    } else {
        $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Host "[pin-bonsai] pid $($p.Id): could not pin working set (Win32 error $err)" -ForegroundColor Yellow
    }
    try {
        $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::AboveNormal
        Write-Host "[pin-bonsai] pid $($p.Id): priority AboveNormal"
    } catch {
        Write-Host "[pin-bonsai] pid $($p.Id): could not raise priority" -ForegroundColor Yellow
    }
}
