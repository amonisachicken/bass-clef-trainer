# 在 Windows 上打包低音谱号训练器为安装程序（MSI + NSIS）。
#
# 前置要求（仅 Windows）：
#   - VS Build Tools（含"使用 C++ 的桌面开发"工作负载）: https://visualstudio.microsoft.com/visual-cpp-build-tools/
#   - WebView2 Runtime（Win10/11 自带）
#   - Rust:  https://rustup.rs
#   - Node.js（用于生成图标）: https://nodejs.org
#
# 用法（PowerShell）:
#   .\scripts\build-windows.ps1
#
# 产物:
#   src-tauri\target\release\bundle\msi\*.msi
#   src-tauri\target\release\bundle\nsis\*-setup.exe

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# 1. 生成图标（幂等）
node scripts/make-icon.mjs

# 2. 确保 tauri-cli（npm 方式）
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "未找到 npx，请先安装 Node.js: https://nodejs.org"
}
if (-not (Test-Path "node_modules\@tauri-apps\cli")) {
    npm install -D "@tauri-apps/cli"
}

# 3. 打包 MSI + NSIS 安装程序
npx tauri build --bundles msi,nsis

Write-Host ""
Write-Host "打包完成，产物位于:"
Get-ChildItem "src-tauri\target\release\bundle\msi\*.msi" | ForEach-Object { Write-Host "  $($_.FullName)" }
Get-ChildItem "src-tauri\target\release\bundle\nsis\*-setup.exe" | ForEach-Object { Write-Host "  $($_.FullName)" }
