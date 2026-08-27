// 钢琴键盘 Canvas 渲染：白键/黑键布局、点击判定、高亮与音名标注。

import { nameOf } from './notes.js';

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];

/** 圆角矩形路径（兼容旧版 WebView）。 */
function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export class PianoRenderer {
  constructor(canvas, { onKey = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onKey = onKey;
    this.minMidi = 36;
    this.maxMidi = 60;
    this.labels = true;
    this.useSharp = true;
    this.highlightMidi = null; // 目标键（看键认谱）
    this.correctMidi = null;   // 作答后正确的键
    this.wrongMidi = null;     // 作答后点错的键
    this.whiteW = 26;
    this.whiteH = 128;
    this.blackW = 16;
    this.blackH = 84;
    this.keys = [];
    this.buildKeys();
    this.layout();
    this.bindEvents();
    this.draw();
  }

  setRange(minMidi, maxMidi, { labels = this.labels, useSharp = this.useSharp } = {}) {
    this.minMidi = minMidi;
    this.maxMidi = maxMidi;
    this.labels = labels;
    this.useSharp = useSharp;
    this.buildKeys();
    this.layout();
    this.draw();
  }

  buildKeys() {
    this.keys = [];
    let whiteIdx = -1;
    for (let m = this.minMidi; m <= this.maxMidi; m++) {
      const pc = m % 12;
      if (WHITE_PCS.includes(pc)) {
        whiteIdx++;
        this.keys.push({ midi: m, white: true, x: whiteIdx * this.whiteW });
      } else {
        this.keys.push({
          midi: m,
          white: false,
          x: whiteIdx * this.whiteW + this.whiteW - this.blackW / 2,
        });
      }
    }
    this.nWhites = whiteIdx + 1;
  }

  layout() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.nWhites * this.whiteW;
    const h = this.whiteH + 4;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
  }

  bindEvents() {
    this.canvas.addEventListener('click', (e) => {
      const m = this.hitTest(e);
      if (m !== null && this.onKey) this.onKey(m);
    });
  }

  hitTest(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < 0 || y > this.whiteH) return null;
    // 先黑键（后画，位于白键之上）
    for (let i = this.keys.length - 1; i >= 0; i--) {
      const k = this.keys[i];
      if (k.white) continue;
      if (y <= this.blackH && x >= k.x - 1 && x <= k.x + this.blackW + 1) return k.midi;
    }
    // 再白键
    for (const k of this.keys) {
      if (!k.white) continue;
      if (x >= k.x && x < k.x + this.whiteW) return k.midi;
    }
    return null;
  }

  // ---- 对外控制 ----

  /** 高亮目标键（看键认谱）。 */
  highlight(midi) {
    this.highlightMidi = midi;
    this.correctMidi = null;
    this.wrongMidi = null;
    this.draw();
  }

  /** 清除高亮与反馈。 */
  clearFeedback() {
    this.highlightMidi = null;
    this.correctMidi = null;
    this.wrongMidi = null;
    this.draw();
  }

  /** 作答后显示正确键（可附带点错的键）。 */
  showFeedback(correctMidi, wrongMidi = null) {
    this.highlightMidi = null;
    this.correctMidi = correctMidi;
    this.wrongMidi = wrongMidi;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.nWhites * this.whiteW, this.whiteH + 4);

    // 白键
    for (const k of this.keys) {
      if (!k.white) continue;
      ctx.fillStyle = '#f2f5fb';
      ctx.strokeStyle = '#8b96ad';
      ctx.lineWidth = 1;
      rr(ctx, k.x, 0, this.whiteW, this.whiteH, 4);
      ctx.fill();
      ctx.stroke();
      if (k.midi === this.highlightMidi) this.tint(k, 'rgba(91, 140, 255, 0.55)');
      if (k.midi === this.correctMidi) this.tint(k, 'rgba(52, 211, 153, 0.65)');
      if (k.midi === this.wrongMidi) this.tint(k, 'rgba(248, 113, 113, 0.65)');
      if (this.labels) this.label(k, '#39415a');
    }
    // 黑键
    for (const k of this.keys) {
      if (k.white) continue;
      ctx.fillStyle = '#151a26';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      rr(ctx, k.x, 0, this.blackW, this.blackH, 3);
      ctx.fill();
      ctx.stroke();
      if (k.midi === this.highlightMidi) this.tint(k, 'rgba(91, 140, 255, 0.75)');
      if (k.midi === this.correctMidi) this.tint(k, 'rgba(52, 211, 153, 0.8)');
      if (k.midi === this.wrongMidi) this.tint(k, 'rgba(248, 113, 113, 0.8)');
      if (this.labels) this.label(k, '#cbd5e8');
    }
    // 目标键上方的音名提示（看键认谱）
    if (this.highlightMidi !== null) {
      const k = this.keys.find((kk) => kk.midi === this.highlightMidi);
      if (k) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const cx = k.x + (k.white ? this.whiteW / 2 : this.blackW / 2);
        ctx.fillText(nameOf(this.highlightMidi, this.useSharp), cx, k.white ? this.whiteH - 10 : this.blackH - 8);
      }
    }
  }

  tint(k, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    rr(ctx, k.x, 0, k.white ? this.whiteW : this.blackW, k.white ? this.whiteH : this.blackH, 4);
    ctx.fill();
    ctx.restore();
  }

  label(k, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const full = nameOf(k.midi, this.useSharp);
    const short = k.midi % 12 === 0 ? full : full.replace(/\d+$/, '');
    const cx = k.x + (k.white ? this.whiteW / 2 : this.blackW / 2);
    ctx.fillText(short, cx, k.white ? this.whiteH - 6 : this.blackH - 4);
    ctx.restore();
  }
}
