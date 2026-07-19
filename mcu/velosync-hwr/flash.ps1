param(
    [string]$Port,
    [string]$Environment = "wemos_d1_mini_pro"
)

$ErrorActionPreference = "Stop"
$projectDir = $PSScriptRoot

function Find-PlatformIO {
    foreach ($name in @("pio", "platformio")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }

    $fallbacks = @(
        (Join-Path $HOME ".platformio\penv\Scripts\pio.exe"),
        (Join-Path $HOME ".platformio\penv\Scripts\platformio.exe")
    )
    foreach ($candidate in $fallbacks) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "PlatformIO was not found. Install PlatformIO Core or add 'pio' to PATH."
}

function Invoke-PlatformIO {
    param([string[]]$Arguments)

    & $script:pio @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "PlatformIO exited with code $LASTEXITCODE."
    }
}

$pio = Find-PlatformIO
$ssid = Read-Host "Wi-Fi SSID (leave empty to use VeloSync-HWR access-point mode)"
$securePassword = Read-Host "Wi-Fi password" -AsSecureString
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $env:VELOSYNC_WIFI_SSID = $ssid
    $env:VELOSYNC_WIFI_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)

    if (-not $Port) {
        Write-Host "`nAvailable serial devices:"
        Invoke-PlatformIO -Arguments @("device", "list")
        $Port = Read-Host "Serial port to upload and monitor (for example COM3)"
    }
    if ([string]::IsNullOrWhiteSpace($Port)) {
        throw "A serial port is required."
    }

    Write-Host "`nBuilding firmware..."
    Invoke-PlatformIO -Arguments @("run", "--project-dir", $projectDir, "--environment", $Environment)

    Write-Host "`nUploading firmware to $Port..."
    Invoke-PlatformIO -Arguments @(
        "run", "--project-dir", $projectDir, "--environment", $Environment,
        "--target", "upload", "--upload-port", $Port
    )
}
finally {
    Remove-Item Env:VELOSYNC_WIFI_SSID -ErrorAction SilentlyContinue
    Remove-Item Env:VELOSYNC_WIFI_PASSWORD -ErrorAction SilentlyContinue
    if ($passwordPtr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
    }
    $securePassword = $null
}

Write-Host "`nStarting serial monitor on $Port at 115200 baud. Press Ctrl+C to stop."
& $pio device monitor --port $Port --baud 115200
