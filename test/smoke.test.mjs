// 前端主逻辑冒烟测试（jsdom）：验证 init 完整执行、设置加载/持久化、两种模式作答正常。
// 历史教训：main.js 曾引用未定义函数导致 bindControls 抛错、init 中止；
// save_settings 曾清空后端当前题导致切模式后点击无反应——本测试用于捕获这类问题。
// 运行: npm run test:js（node --test test/*.test.mjs）

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/' });
const { window } = dom;

// ---- canvas 桩：所有 ctx 方法可调用，属性可读写 ----
window.HTMLCanvasElement.prototype.getContext = function () {
  const canvas = this;
  return new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return canvas;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
};
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 250 });

// ---- 注入全局（不覆写 setTimeout，避免破坏 jsdom 内部定时器） ----
for (const k of ['window', 'document', 'localStorage', 'location', 'HTMLElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent']) {
  try { globalThis[k] = window[k]; } catch { Object.defineProperty(globalThis, k, { value: window[k], configurable: true }); }
}
try { globalThis.navigator = window.navigator; } catch { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); }
globalThis.self = window;

const errors = [];
window.addEventListener('error', (e) => errors.push(e.message));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.message || e.reason)));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => window.document.querySelector(sel);

test('前端主逻辑：init 完整执行，设置加载/联动/答错下一题正常', async () => {
  // 动态加载主模块（demo 模式：无 window.__TAURI__）
  await import('../src/main.js');
  await wait(600);

  // 1. init 完成后应显示默认 F2–B3（而非 C1–C1）
  assert.equal($('#minNote').value, '41', '最低音默认应为 F2(41)');
  assert.equal($('#maxNote').value, '59', '最高音默认应为 B3(59)');

  // 2. 联动禁用：最高音栏低于 F2 的禁用、最低音栏高于 B3 的禁用
  const maxDisabled = [...$('#maxNote').options].filter((o) => o.disabled).map((o) => +o.value);
  assert.ok(maxDisabled.length > 0 && Math.max(...maxDisabled) < 41, '最高音栏应禁用低于 F2 的音');
  const minDisabled = [...$('#minNote').options].filter((o) => o.disabled).map((o) => +o.value);
  assert.ok(minDisabled.length > 0 && Math.min(...minDisabled) > 59, '最低音栏应禁用高于 B3 的音');

  // 3. 修改最低音 → 界面与持久化同步
  $('#minNote').value = '50';
  $('#minNote').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(300);
  const saved = JSON.parse(window.localStorage.getItem('bass-clef-profile-v1') || '{}');
  assert.equal(saved.settings.minMidi, 50, '改动应持久化到 localStorage');
  assert.equal($('#minNote').value, '50');

  // 4. 答错 → 下一题按钮可用 → 点击出题
  const piano = $('#pianoCanvas');
  // 点击钢琴最左侧键（范围 F2–B3 内的键）
  piano.dispatchEvent(new window.MouseEvent('click', { clientX: 5, clientY: 60, bubbles: true }));
  await wait(500);
  const fb = $('#feedback');
  const nextBtn = $('#nextBtn');
  if (!nextBtn.hidden) {
    // 答错路径：点击下一题，处理函数必须真实可用（历史上曾因引用未定义函数而失效）
    nextBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(400);
    assert.ok(nextBtn.hidden, '点击后按钮应隐藏');
    assert.ok(fb.hidden, '反馈应被清除');
  } else {
    // 答对路径：autoNext 应已进入下一题
    assert.ok(fb.hidden || $('#streak').textContent === '1', '答对后应自动进入下一题');
  }

  // 5. 无未处理错误（捕获 init 中止 / 事件处理抛错类问题）
  assert.deepEqual(errors, [], '不应有任何运行时错误');
});

test('谱表高度随音域动态扩展（默认 F2–B3 高度 250，每超出一个音符扩展一个 gap）', async () => {
  const { StaffRenderer } = await import('../src/js/staff.js');
  // 构造一个带父容器的 canvas
  const wrap = window.document.createElement('div');
  wrap.style.width = '800px';
  wrap.style.height = '300px';
  window.document.body.appendChild(wrap);
  const canvas = window.document.createElement('canvas');
  wrap.appendChild(canvas);

  const r = new StaffRenderer(canvas, {});
  // 默认 F2(41,pos-1)–B3(59,pos9)：不扩展
  r.setRange(41, 59, false);
  assert.equal(r.h, 250, '默认音域高度应为 250');
  assert.equal(r.h - r.line1Y, 62, '默认音域底部边距应不变');

  // 最高音 E4(64,pos12)：高于 B3 3 个音符 → 上方扩展 3*gap（谱表下移、底部边距不变）
  r.setRange(41, 64, false);
  assert.equal(r.h, 250 + 3 * r.gap, '最高音升高 3 音符应扩展 3*gap');
  assert.equal(r.h - r.line1Y, 62, '只升高最高音时底部边距应不变');
  assert.equal(r.line5Y, (250 - 62 - 8 * r.gap) + 3 * r.gap, '上方空间应扩展 3*gap');

  // 最低音 C2(36,pos-4)：低于 F2 3 个音符 → 下方扩展 3*gap（line1Y 上移）
  r.setRange(36, 59, false);
  assert.equal(r.h, 250 + 3 * r.gap, '最低音降低 3 音符应扩展 3*gap');
  assert.equal(r.h - r.line1Y, 62 + 3 * r.gap, '最低音降低时底部边距应扩展 3*gap');
  assert.equal(r.line5Y, 250 - 62 - 8 * r.gap, '只降低最低音时上方空间应不变');

  // 双向同时扩展
  r.setRange(36, 64, false);
  assert.equal(r.h, 250 + 6 * r.gap, '双向各扩展 3 音符应共扩展 6*gap');
  assert.equal(r.aboveExtra, 3, 'aboveExtra 应为 3');
  assert.equal(r.belowExtra, 3, 'belowExtra 应为 3');

  // 谱表内部几何：一线到五线 = 8*gap（5 条线 × 4 个间隔 × 2gap）
  assert.equal(r.line1Y - r.line5Y, 8 * r.gap, '一线到五线间距应为 8*gap');
});

test('看键认谱模式：切换后点击谱表应正常作答', async () => {
  // 模式按钮应只剩两个（音名问答已移除）
  const modeBtns = [...window.document.querySelectorAll('.mode-btn')];
  assert.equal(modeBtns.length, 2, '应只剩看谱弹键/看键认谱两个模式');

  // 切换到看键认谱
  const p2s = modeBtns.find((b) => b.dataset.mode === 'pianoToStaff');
  p2s.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(400);

  // 点击谱表上的音位（jsdom 中 staff 布局：w=640, gap=17, line1Y=188, noteX≈269；
  // 注意第一个测试把最低音改成了 50，这里点范围内的 pos6=F3）
  const staff = $('#staffCanvas');
  staff.dispatchEvent(new window.MouseEvent('click', {
    clientX: 269, clientY: 188 - 6 * 17, bubbles: true, // pos6 音位
  }));
  await wait(400);

  const fb = $('#feedback');
  assert.ok(!fb.hidden, '点击谱表后应出现作答反馈');
  assert.ok(/正确答案/.test(fb.textContent), `反馈应显示判定结果: ${fb.textContent}`);
  assert.deepEqual(errors, [], '看键认谱流程不应有任何运行时错误');
});
