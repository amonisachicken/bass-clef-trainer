# 🎼 低音谱号训练器（Bass Clef Trainer）

一个帮助你**记忆低音谱号（F 谱号）五线四间与钢琴琴键对应关系**的跨平台桌面应用。

| 前端 | 后端 | 平台 |
| --- | --- | --- |
| 原生 JavaScript（Canvas 渲染，零构建步骤） | Rust（Tauri 2 + 独立核心库） | macOS / Windows / Linux |

## ✨ 功能

- **两种练习模式**
  - **看谱弹键**：谱表显示音符 → 点击钢琴上对应的琴键
  - **看键认谱**：高亮一个琴键 → 点击谱表上对应的音位（附提示音）
- **音域可调**：最低音 / 最高音两栏（默认 F2–B3），越界选项自动置灰；设置即时保存、下次启动延续；谱表随音域自动扩展——最高音每高出一个音符、上方加宽一个音符高度，最低音同理向下扩展
- **对照表**：低音谱五线四间音名标注 + 口诀（五线 G B D F A，四间 A C E G）
- **Web Audio 合成音效**：钢琴音、答对/答错提示（无需音频文件）
- **学习统计**：今日/累计正确率、当前连对、最佳连对，由 Rust 持久化
- **浏览器降级模式**：直接用浏览器打开 `src/index.html` 也能完整运行（localStorage 保存数据）

## 📁 目录结构

```
bass-clef-trainer/
├── core/                  # Rust 核心库（纯逻辑，可独立测试）
│   └── src/
│       ├── notes.rs       #   音高 ↔ 音名 / 低音谱表位置换算
│       ├── quiz.rs        #   出题、答案判定
│       └── store.rs       #   设置与统计的 JSON 持久化
├── src-tauri/             # Tauri 桌面应用壳（Rust）
│   ├── src/
│   │   ├── lib.rs         #   应用状态、命令注册
│   │   ├── commands.rs    #   前端可调用的 Tauri 命令
│   │   └── main.rs
│   ├── tauri.conf.json    # 窗口 / 打包配置
│   ├── capabilities/      # 权限声明
│   └── icons/             # 三平台图标（脚本生成）
├── src/                   # 前端（原生 JS，静态文件）
│   ├── index.html
│   ├── styles.css
│   ├── main.js            # 应用主逻辑
│   └── js/                # notes / staff / piano / audio / api / demo
├── scripts/make-icon.mjs  # 生成应用图标（纯 Node）
└── test/                  # 前端逻辑单元测试（node --test）
```

**架构说明**：出题、答题判定、统计更新等**权威逻辑全部在 Rust 核心库**中，前端只负责渲染与交互；
`src/js/demo.js` 中的 JS 复刻仅用于浏览器预览，桌面应用中不会执行。

## 🛠 开发环境要求

| 平台 | 依赖 |
| --- | --- |
| 通用 | [Rust](https://rustup.rs/)（stable，1.77.2+） |
| Windows | WebView2 Runtime（Win10/11 自带）、[VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含“使用 C++ 的桌面开发”工作负载） |
| macOS | Xcode Command Line Tools（`xcode-select --install`） |
| Linux | 见下方 apt 命令 |

```bash
# Ubuntu / Debian
sudo apt install libwebkit2gtk-4.1-dev build-essential \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

Node.js（可选）：仅用于 `@tauri-apps/cli` 与前端测试，Rust 侧也可以用 `cargo` 完成全部工作。

## 🚀 运行与构建

```bash
# 方式一：npm（推荐，需 Node 18+）
npm install -D @tauri-apps/cli
npm run dev        # 开发模式（热重载）
npm run build      # 打包 → src-tauri/target/release/bundle/

# 方式二：纯 cargo
cargo install tauri-cli --locked
cargo tauri dev
cargo tauri build
```

各平台打包产物：

- **Windows**：`bundle/msi/`、`bundle/nsis/`（.exe 安装包）
- **macOS**：`bundle/dmg/`、`bundle/macos/`（.app）
- **Linux**：`bundle/deb/`、`bundle/rpm/`、`bundle/appimage/`

## 📦 打包为可部署应用

### Windows（两种方式）

**方式 A · 在 Windows 本机打包**（推荐，最简单）：

```powershell
.\scripts\build-windows.ps1
# 产物：src-tauri\target\release\bundle\nsis\*-setup.exe 与 msi\*.msi
```

**方式 B · 在 Linux / macOS 上交叉编译**（无需 Windows 机器）：

```bash
# 1. 安装 Windows 目标与工具链
rustup target add x86_64-pc-windows-msvc
#    cargo-xwin：交叉链接器（从微软自动下载 MSVC CRT 与 Windows SDK）
#      官网 https://github.com/rust-cross/cargo-xwin 下载预编译包，或: cargo install cargo-xwin
#    LLVM 工具（llvm-rc / llvm-lib / clang-cl / lld-link）：
#      Ubuntu/Debian: sudo apt install llvm-19 clang-19 lld-19
#    NSIS（Linux 版 makensis，用于打安装包）：
#      sudo apt install nsis

# 2. 交叉编译并打 NSIS 安装包（-setup.exe）
export PATH="/usr/lib/llvm-19/bin:$PATH"
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
# 产物：src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe
```

> 本仓库已在 Linux 上实测通过该流程（Tauri 2.11 + cargo-xwin 0.23 + LLVM 19）。

### macOS（仅能在 macOS 上打包，需要 Xcode）

```bash
./scripts/build-macos.sh            # 当前芯片架构
./scripts/build-macos.sh --universal # 通用包（同时支持 Intel 与 Apple Silicon）
# 产物：src-tauri/target/release/bundle/dmg/*.dmg 与 macos/*.app
```

> Tauri 官方不支持在 Linux 上交叉编译 macOS（需要苹果 SDK / Xcode）。

### 三平台一键打包（GitHub Actions）

项目已内置 `.github/workflows/build.yml`：推送形如 `v0.1.0` 的 Git 标签（或手动触发），
自动在 macOS / Windows / Linux 三台机器上打包，并把 `.dmg`、`.exe/.msi`、`.deb/.AppImage`
上传为 GitHub Release 附件。**每次发布会自动把"自上一个标签以来的提交"写入 Release 说明**，
方便查看本次更新内容。示例：

```bash
git tag v0.1.0 && git push origin v0.1.0
```

> 打包目标默认 `all`；如需精简可修改 `src-tauri/tauri.conf.json` 中 `bundle.targets`，
> 例如 `["deb", "appimage"]` 或 `["nsis"]`。

### 浏览器预览（无 Tauri 环境）

用任意静态服务器打开 `src/` 即可（例如 `npx serve src` 或 `python -m http.server`），
右上角会显示“浏览器预览模式”。数据保存在 localStorage。

### 重新生成应用图标

```bash
npm run icons    # node scripts/make-icon.mjs
```

## ✅ 测试

```bash
cargo test --manifest-path core/Cargo.toml   # Rust 核心库（音符换算 / 出题 / 统计 / 持久化）
npm run test:js                              # 前端逻辑（与 Rust 逻辑相互印证）
npm run check:js                             # 前端语法检查
```

## 📝 数据存储位置

用户设置与学习统计保存在应用数据目录的 `profile.json`：

- Linux：`~/.local/share/com.basscleftrainer.desktop/`
- macOS：`~/Library/Application Support/com.basscleftrainer.desktop/`
- Windows：`%APPDATA%\com.basscleftrainer.desktop\`

## 🎓 乐理说明（低音谱号）

低音谱表五线四间（从下往上）：

```
   ── A3  五线
  ══ G3  四间
   ── F3  四线 ← F 谱号两点所指
  ══ E3  三间
   ── D3  三线
  ══ C3  二间
   ── B2  二线
  ══ A2  一间
   ── G2  一线
  ── E2  下加一线
```

口诀：五线 **G B D F A**（Good Boys Do Fine Always），四间 **A C E G**（All Cows Eat Grass）。
下加一线是 E2，上加一线是 C4（中央 C）。
