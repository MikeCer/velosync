#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
port="${1:-}"
environment="${2:-wemos_d1_mini_pro}"

find_platformio() {
  local candidate
  for candidate in pio platformio; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return
    fi
  done

  for candidate in \
    "$HOME/.platformio/penv/bin/pio" \
    "$HOME/.platformio/penv/Scripts/pio.exe" \
    "$HOME/.platformio/penv/Scripts/platformio.exe"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  printf 'PlatformIO was not found. Install PlatformIO Core or add pio to PATH.\n' >&2
  exit 1
}

pio="$(find_platformio)"

read -r -p "Wi-Fi SSID (leave empty to use VeloSync-HWR access-point mode): " VELOSYNC_WIFI_SSID
read -r -s -p "Wi-Fi password: " VELOSYNC_WIFI_PASSWORD
printf '\n'
export VELOSYNC_WIFI_SSID VELOSYNC_WIFI_PASSWORD

clear_credentials() {
  unset VELOSYNC_WIFI_SSID VELOSYNC_WIFI_PASSWORD
}
trap clear_credentials EXIT INT TERM

if [[ -z "$port" ]]; then
  printf '\nAvailable serial devices:\n'
  "$pio" device list
  read -r -p "Serial port to upload and monitor (for example COM3 or /dev/ttyUSB0): " port
fi
if [[ -z "$port" ]]; then
  printf 'A serial port is required.\n' >&2
  exit 1
fi

printf '\nBuilding firmware...\n'
"$pio" run --project-dir "$project_dir" --environment "$environment"

printf '\nUploading firmware to %s...\n' "$port"
"$pio" run \
  --project-dir "$project_dir" \
  --environment "$environment" \
  --target upload \
  --upload-port "$port"

clear_credentials
trap - EXIT INT TERM

printf '\nStarting serial monitor on %s at 115200 baud. Press Ctrl+C to stop.\n' "$port"
exec "$pio" device monitor --port "$port" --baud 115200
