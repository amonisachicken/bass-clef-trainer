#!/usr/bin/env bash
# 在 macOS 上打包低音谱号训练器为 .app 与 .dmg。
#
# 前置要求（仅 macOS）：
#   - Xcode Command Line Tools:  xcode-select --install
#   - Rust:                       curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
#   - Tauri CLI（脚本会自动安装）
#
# 用法：
#   ./scripts/build-macos.sh          # Intel 与 Apple Silicon 分别打包
#   ./scripts/build-macos.sh --universal  # 打出通用（Universal）二进制，.app 同时支持两种芯片
#
# 产物：
#   src-tauri/target/release/bundle/macos/*.app
#   src-tauri/target/release/bundle/dmg/*.dmg

set -euo pipefail
cd "$(dirname "$0")/.."

# 1. 生成三平台图标（幂等）
node scripts/make-icon.mjs

# 2. 确保 tauri-cli 可用
if ! command -v cargo-tauri >/dev/null 2>&1 && ! command -v tauri >/dev/null 2>&1; then
  echo "==> 安装 tauri-cli（首次需要几分钟）"
  cargo install tauri-cli --locked
fi

# 3. 打包
if [[ "${1:-}" == "--universal" ]]; then
  echo "==> 添加 macOS 双架构目标"
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  echo "==> 打包 Universal .app + .dmg"
  cargo tauri build --target universal-apple-darwin --bundles app,dmg
else
  echo "==> 打包当前架构 .app + .dmg（Apple Silicon 加 --universal 可出通用包）"
  cargo tauri build --bundles app,dmg
fi

echo ""
echo "✅ 打包完成，产物位于："
ls -1 src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || true
ls -1d src-tauri/target/release/bundle/macos/*.app 2>/dev/null || true
