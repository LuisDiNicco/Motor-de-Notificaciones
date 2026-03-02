# Script to kill any process using port 3000
# This is useful when the backend fails to start due to port already in use

$port = 3000
$processInfo = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processInfo) {
    Write-Host "Found process(es) using port $port" -ForegroundColor Yellow
    foreach ($processId in $processInfo) {
        if ($processId -le 4) {
            Write-Host "Skipping system process PID: $processId" -ForegroundColor Yellow
            continue
        }

        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Killing process: $($process.ProcessName) (PID: $processId)" -ForegroundColor Red
            try {
                Stop-Process -Id $processId -Force -ErrorAction Stop
                Write-Host "Process killed successfully" -ForegroundColor Green
            }
            catch {
                Write-Host "Failed to kill PID ${processId}: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "Port $port is free" -ForegroundColor Green
}
