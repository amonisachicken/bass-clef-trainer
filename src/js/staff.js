// 低音谱表（F 谱号）Canvas 渲染：谱线、谱号、音符、加线、点击选音位。

import {
  staffPosition,
  midiFromPosition,
  ledgerBelow,
  ledgerAbove,
  isNatural,
  nameOf,
} from './notes.js';

/** 绘制椭圆（旋转），兼容旧版 WebView 的 canvas。 */
function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.restore();
}

/** 在任意上下文中绘制 F 谱号（供主谱表与对照表复用）。 */
export function drawBassClefAt(ctx, { x, line1Y, gap }) {
  const g = gap;
  const fy = line1Y - 6 * g; // F 线（第 4 线）
  ctx.save();
  ctx.strokeStyle = '#dfe8ff';
  ctx.lineWidth = Math.max(2, g * 0.24);
  ctx.lineCap = 'round';
  // 主体弧线
  ctx.beginPath();
  ctx.moveTo(x, line1Y - 4 * g - g * 0.7);
  ctx.bezierCurveTo(
    x - g * 0.3, line1Y - 2.4 * g,
    x + g * 0.3, line1Y - 1.2 * g,
    x + g * 0.05, line1Y + 0.1 * g,
  );
  ctx.bezierCurveTo(
    x - g * 0.3, line1Y + 1.1 * g,
    x - g * 0.7, line1Y + 0.15 * g,
    x - g * 0.45, line1Y - 0.5 * g,
  );
  ctx.stroke();
  // 竖线
  ctx.beginPath();
  ctx.moveTo(x + g * 0.34, line1Y - 4 * g - g * 0.45);
  ctx.lineTo(x + g * 0.34, line1Y - 0.2 * g);
  ctx.stroke();
  // F 线两侧的两个点
  ctx.fillStyle = '#dfe8ff';
  const r = Math.max(2.4, g * 0.17);
  ctx.beginPath();
  ctx.arc(x - g * 0.95, fy - g * 0.55, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - g * 0.95, fy + g * 0.55, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export class StaffRenderer {
  constructor(canvas, { onPick = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onPick = onPick;
    this.minMidi = 36;
    this.maxMidi = 60;
    this.allowAccidentals = false;
    this.interactive = false;
    this.noteMidi = null;   // 当前题目显示的音
    this.answerMidi = null; // 作答后显示的正确答案
    this.wrongPos = null;   // 用户点错的位置
    this.hoverMidi = null;
    this.layout();
    this.bindEvents();
    this.draw();
    window.addEventListener('resize', () => {
      this.layout();
      this.draw();
    });
  }

  setRange(minMidi, maxMidi, allowAccidentals) {
    this.minMidi = minMidi;
    this.maxMidi = maxMidi;
    this.allowAccidentals = allowAccidentals;
    this.draw();
  }

  setInteractive(on) {
    this.interactive = on;
    this.canvas.style.cursor = on ? 'pointer' : 'crosshair';
    this.draw();
  }

  layout() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(360, this.canvas.parentElement.clientWidth || 640);
    this.w = w;
    this.h = 250;
    this.canvas.width = w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.dpr = dpr;
    this.gap = Math.min(17, Math.max(11, w / 36));
    this.line1Y = this.h - 62;             // 最下线（第一线）
    this.line5Y = this.line1Y - 4 * this.gap;
    this.noteX = this.w * 0.42;
  }

  bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.interactive) return;
      const m = this.hitTest(e);
      if (m !== this.hoverMidi) {
        this.hoverMidi = m;
        this.draw();
      }
    });
    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoverMidi !== null) {
        this.hoverMidi = null;
        this.draw();
      }
    });
    this.canvas.addEventListener('click', (e) => {
      if (!this.interactive || !this.onPick) return;
      const m = this.hitTest(e);
      if (m !== null) this.onPick(m);
    });
  }

  hitTest(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < this.w * 0.18 || x > this.w * 0.9) return null;
    const pos = Math.round((this.line1Y - y) / this.gap);
    const midi = midiFromPosition(pos);
    if (midi < this.minMidi || midi > this.maxMidi) return null;
    if (!this.allowAccidentals && !isNatural(midi)) return null;
    return midi;
  }

  yOf(pos) {
    return this.line1Y - pos * this.gap;
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawBackground(ctx);
    this.drawStaffLines(ctx);
    drawBassClefAt(ctx, { x: this.w * 0.16, line1Y: this.line1Y, gap: this.gap });
    if (this.interactive && this.hoverMidi !== null) {
      this.drawNote(ctx, this.hoverMidi, { ghost: true });
    }
    if (this.answerMidi !== null) {
      this.drawNote(ctx, this.answerMidi, { accent: true });
    } else if (this.noteMidi !== null) {
      this.drawNote(ctx, this.noteMidi, {});
    }
    if (this.wrongPos !== null) this.drawWrongMark(ctx, this.wrongPos);
    if (this.interactive && this.noteMidi === null && this.answerMidi === null) {
      this.drawTargets(ctx);
    }
  }

  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#0e1830');
    g.addColorStop(1, '#111a2c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawStaffLines(ctx) {
    ctx.strokeStyle = 'rgba(120, 145, 200, 0.55)';
    ctx.lineWidth = 1.4;
    for (let p = 0; p <= 8; p += 2) {
      const y = this.yOf(p);
      ctx.beginPath();
      ctx.moveTo(this.w * 0.12, y);
      ctx.lineTo(this.w * 0.94, y);
      ctx.stroke();
    }
  }

  drawNote(ctx, midi, { ghost = false, accent = false } = {}) {
    const pos = staffPosition(midi);
    const y = this.yOf(pos);
    const x = this.noteX;
    const g = this.gap;
    ctx.save();
    // 加线
    const lineColor = ghost ? 'rgba(220, 230, 255, 0.5)' : '#dfe8ff';
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.4;
    const lb = ledgerBelow(pos);
    for (let i = 1; i <= lb; i++) {
      const ly = this.line1Y + i * 2 * g;
      ctx.beginPath();
      ctx.moveTo(x - g * 2.1, ly);
      ctx.lineTo(x + g * 2.1, ly);
      ctx.stroke();
    }
    const la = ledgerAbove(pos);
    for (let i = 1; i <= la; i++) {
      const ly = this.line5Y - i * 2 * g;
      ctx.beginPath();
      ctx.moveTo(x - g * 2.1, ly);
      ctx.lineTo(x + g * 2.1, ly);
      ctx.stroke();
    }
    // 符头
    ctx.fillStyle = ghost
      ? 'rgba(220, 230, 255, 0.45)'
      : accent
        ? '#ffd166'
        : '#ffffff';
    ellipse(ctx, x, y, g * 0.78, g * 0.56, -0.35);
    ctx.fill();
    if (!ghost) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawWrongMark(ctx, pos) {
    const x = this.noteX + this.gap * 1.6;
    const y = this.yOf(pos);
    ctx.save();
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const s = this.gap * 0.6;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();
    ctx.restore();
  }

  drawTargets(ctx) {
    // 可点击音位的淡色圆点提示
    const lo = staffPosition(this.minMidi);
    const hi = staffPosition(this.maxMidi);
    ctx.save();
    for (let pos = lo; pos <= hi; pos++) {
      if (!this.allowAccidentals && !isNatural(midiFromPosition(pos))) continue;
      ctx.fillStyle = 'rgba(150, 180, 255, 0.13)';
      ctx.beginPath();
      ctx.arc(this.noteX, this.yOf(pos), this.gap * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- 对外控制 ----

  /** 显示一道题的音符。 */
  showQuestion(noteMidi) {
    this.noteMidi = noteMidi;
    this.answerMidi = null;
    this.wrongPos = null;
    this.draw();
  }

  /** 清空音符（看键认谱模式：等待用户点击谱表）。 */
  showEmpty() {
    this.noteMidi = null;
    this.answerMidi = null;
    this.wrongPos = null;
    this.draw();
  }

  /** 作答后显示正确答案（可附带用户点错的位置）。 */
  showAnswer(midi, wrongMidi = null) {
    this.answerMidi = midi;
    this.wrongPos = wrongMidi !== null ? staffPosition(wrongMidi) : null;
    this.draw();
  }
}

/** 在对照表画布上绘制低音谱表 + 各音位与音名标注。 */
export function drawCheatSheet(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 288;
  const h = 158;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#111a2c';
  ctx.fillRect(0, 0, w, h);

  const gap = 13;
  const line1Y = h - 34;
  const line5Y = line1Y - 4 * gap;
  const labelX = w * 0.34;

  // 谱线
  ctx.strokeStyle = 'rgba(120, 145, 200, 0.6)';
  ctx.lineWidth = 1.2;
  for (let p = 0; p <= 8; p += 2) {
    const y = line1Y - p * gap;
    ctx.beginPath();
    ctx.moveTo(w * 0.04, y);
    ctx.lineTo(w * 0.97, y);
    ctx.stroke();
  }
  drawBassClefAt(ctx, { x: w * 0.12, line1Y, gap });

  ctx.font = `600 ${Math.round(gap * 0.92)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // 线位（含下加一线 E2 与上加一线 C4）
  for (let pos = -2; pos <= 10; pos += 2) {
    const midi = midiFromPosition(pos);
    const y = line1Y - pos * gap;
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, labelX, y, gap * 0.66, gap * 0.48, -0.3);
    ctx.fill();
    ctx.fillStyle = '#e9eefb';
    ctx.fillText(nameOf(midi), labelX + gap * 1.15, y);
  }
  // 间位（空心圆）
  for (let pos = -1; pos <= 9; pos += 2) {
    const midi = midiFromPosition(pos);
    const y = line1Y - pos * gap;
    ctx.strokeStyle = '#dfe8ff';
    ctx.lineWidth = 1.5;
    ellipse(ctx, labelX, y, gap * 0.6, gap * 0.44, -0.3);
    ctx.stroke();
    ctx.fillStyle = '#9fb0d8';
    ctx.fillText(nameOf(midi), labelX + gap * 1.15, y);
  }
}
