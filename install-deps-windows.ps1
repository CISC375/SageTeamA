#Runs as administrator
$adminCheck = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $adminCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires administrative privileges. Restarting..."
    Start-Process powershell -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs -Wait
}

Write-Host "Installing Windows dependencies for node-canvas and node-gyp..."

#Check if Chocolatey is installed, install if not
if (!(Test-Path "$env:ProgramData\chocolatey\bin\choco.exe")) {
    Write-Host "Installing Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    RefreshEnv
}

#Check for pending reboot BEFORE installation
$pendingReboot = Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
if ($pendingReboot) {
    Write-Host "Pending system reboot detected. Please restart your computer and rerun this script."
}

#Enable Chocolatey to ignore pending reboots (if needed)
Write-Host "Configuring Chocolatey to ignore pending reboots..."
choco feature enable --name="exitOnRebootDetected"

#Force reinstall Visual Studio Build Tools with necessary components
Write-Host "Installing Visual Studio 2022 tools..."
choco install python visualstudio2022-workload-vctools -y

#Set GYP_MSVS_VERSION for node-gyp
Write-Host "Setting GYP_MSVS_VERSION for node-gyp..."
[System.Environment]::SetEnvironmentVariable("GYP_MSVS_VERSION", "2022", "Machine")

#Install MSYS2
Write-Host "Installing MSYS2..."
choco install -y msys2

#Force refresh pacman package database
Write-Host "Updating MSYS2 package database..."
& "$msys2Path" -lc "pacman -Sy --noconfirm"

#Install required libraries using pacman
Write-Host "Installing required libraries for node-canvas..."
& "$msys2Path" -lc "pacman -S --needed --noconfirm mingw-w64-x86_64-cairo mingw-w64-x86_64-pango mingw-w64-x86_64-libjpeg-turbo mingw-w64-x86_64-giflib"

#Define the path for binding.gyp
$bindingGypPath = "$PSScriptRoot\binding.gyp"

#Ensure binding.gyp is created without BOM
if (!(Test-Path $bindingGypPath)) {
    Write-Host "Creating missing binding.gyp..."

    $bindingContent = @"
{
  "targets": [
    {
      "target_name": "sage",
      "sources": ["src/sage.ts"]
    }
  ]
}
"@

    # Write file in UTF-8 without BOM
    [System.Text.Encoding]::UTF8.GetBytes($bindingContent) | Set-Content -Path $bindingGypPath -Encoding Byte
}

#Verify Installation
Write-Host "Verifying installed packages..."
& "$msys2Path" -lc "pacman -Q mingw-w64-x86_64-cairo mingw-w64-x86_64-pango mingw-w64-x86_64-libjpeg-turbo mingw-w64-x86_64-giflib"

Write-Host "All dependencies installed successfully!"
