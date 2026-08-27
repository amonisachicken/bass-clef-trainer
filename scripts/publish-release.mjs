#!/usr/bin/env node
/**
 * 将构建产物发布为 GitHub Release（创建/复用 Release + 上传附件）。
 *
 * 用法:
 *   GITHUB_TOKEN=<token> node scripts/publish-release.mjs \
 *     --repo owner/repo \
 *     --tag v0.1.0 \
 *     --name "低音谱号训练器 v0.1.0" \
 *     --body "首个正式发布：macOS / Windows 安装包。" \
 *     --assets "dist/windows/*-setup.exe,dist/windows/BassClefTrainer_0.1.0_x64.exe,dist/macos/*.dmg"
 *
 * 参数:
 *   --repo   必填，owner/repo
 *   --tag    可选，默认 v<package.json version>
 *   --name   可选，Release 标题
 *   --body   可选，Release 说明（Markdown）
 *   --assets 可选，逗号分隔的附件路径，支持 * 通配符
 *   --draft  可选，创建为草稿 Release
 *   --dry-run 只打印将执行的操作，不发网络请求
 *
 * 说明:
 *   - 令牌建议使用 fine-grained PAT，仅授予该仓库 "Contents: Read and write"；
 *     用完后请及时吊销。
 *   - 同名附件已存在时会先删除再重新上传。
 *   - 该仓库需已存在且至少有 1 个提交（新标签会自动指向默认分支最新提交）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const token = process.env.GITHUB_TOKEN;
const args = process.argv.slice(2);
const get = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};
const has = (n) => args.includes(`--${n}`);

const repo = get('repo');
if (!token && !has('dry-run')) {
  console.error('缺少 GITHUB_TOKEN 环境变量');
  process.exit(2);
}
if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) {
  console.error('--repo 必须为 owner/repo 格式，例如 myname/bass-clef-trainer');
  process.exit(2);
}

let version = '0.1.0';
try {
  version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version;
} catch { /* 忽略 */ }

const tag = get('tag') || `v${version}`;
const name = get('name') || `低音谱号训练器 ${tag}`;
const assets = expandAssets(get('assets') || '');
const draft = has('draft');
const dryRun = has('dry-run');

/** 自动生成变更日志：自上一个标签以来的提交（未提供 --body 时使用）。 */
function generateChangelog() {
  try {
    const prev = execSync('git describe --tags --abbrev=0 HEAD^ 2>/dev/null || true', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const range = prev ? `${prev}..HEAD` : '-15 HEAD';
    const log = execSync(`git log --oneline --no-merges ${range}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const items = log ? log.split('\n').map((l) => `- ${l}`).join('\n') : '- （无提交记录）';
    return `## 📦 ${tag} 更新内容\n\n${items}\n`;
  } catch {
    return `## 📦 ${tag} 更新内容\n`;
  }
}

const body = get('body') || generateChangelog();

const API = 'https://api.github.com';
const UPLOAD = 'https://uploads.github.com';
const UA = 'bass-clef-release';
const headers = {
  Authorization: `Bearer ${token}`,
  'User-Agent': UA,
  Accept: 'application/vnd.github+json',
};

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 展开逗号分隔的附件路径（支持 * 通配符）。 */
function expandAssets(patterns) {
  const files = [];
  for (const p of patterns.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (p.includes('*')) {
      const idx = p.lastIndexOf('/');
      const base = (idx >= 0 ? p.slice(0, idx + 1) : './');
      const pat = p.slice(idx + 1);
      const re = new RegExp(`^${pat.split('*').map(escapeReg).join('.*')}$`);
      let entries = [];
      try {
        entries = readdirSync(resolve(base));
      } catch {
        entries = []; // 目录不存在时视为无匹配
      }
      for (const f of entries) {
        if (re.test(f)) files.push(resolve(base, f));
      }
    } else {
      files.push(resolve(p));
    }
  }
  return [...new Set(files)];
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: { ...headers, ...(opts.headers || {}) },
    body: opts.body,
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText}：${(await res.text()).slice(0, 400)}`);
  }
  return res.json();
}

async function main() {
  console.log(`==> 仓库: ${repo}  标签: ${tag}  ${draft ? '(草稿)' : '(正式)'}`);
  console.log(`==> 附件 ${assets.length} 个:`);
  for (const f of assets) console.log(`    - ${f}`);

  if (dryRun) {
    console.log(`\n==> Release 说明（${body.length} 字符）:`);
    console.log(body.slice(0, 400));
    console.log('\n[dry-run] 以上为将要执行的操作，未发起任何网络请求。');
    return;
  }

  // 1. 校验令牌与仓库
  const repoInfo = await api(`/repos/${repo}`);
  console.log(`==> 仓库存在: ${repoInfo.full_name}（默认分支 ${repoInfo.default_branch}）`);

  // 2. 复用已存在的 Release 或新建
  let release;
  try {
    release = await api(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
    console.log(`==> Release 已存在，复用 #${release.id}`);
  } catch {
    release = await api(`/repos/${repo}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name, body, draft, prerelease: false }),
    });
    console.log(`==> 已创建 Release #${release.id}: ${release.html_url}`);
  }

  // 3. 上传附件
  const existingAssets = await api(`/repos/${repo}/releases/${release.id}/assets?per_page=100`);
  for (const f of assets) {
    const fname = basename(f);
    if (!statSync(f).isFile()) {
      console.warn(`    ! 跳过非文件: ${f}`);
      continue;
    }
    const dup = existingAssets.find((a) => a.name === fname);
    if (dup) {
      console.log(`==> 附件 ${fname} 已存在，先删除旧版本`);
      await api(`/repos/${repo}/releases/assets/${dup.id}`, { method: 'DELETE' });
    }
    console.log(`==> 上传 ${fname} (${(statSync(f).size / 1024 / 1024).toFixed(1)} MB) ...`);
    const data = readFileSync(f);
    const res = await fetch(
      `${UPLOAD}/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(fname)}`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: data,
      },
    );
    if (!res.ok) {
      throw new Error(`上传 ${fname} 失败 ${res.status}：${(await res.text()).slice(0, 400)}`);
    }
    console.log(`    ✔ ${fname}`);
  }

  console.log(`\n✅ 发布完成: ${release.html_url}`);
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
