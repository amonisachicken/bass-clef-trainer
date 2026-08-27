// Web Audio 合成音效：钢琴音、答对 / 答错提示。无任何音频资源文件。

let audioCtx = null;

/** 在首次用户交互时调用，解锁 AudioContext。 */
export function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    // 无声环境直接忽略
  }
}

function tone(freq, { dur = 0.5, type = 'triangle', gain = 0.22, when = 0 } = {}) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** 播放一个钢琴音（MIDI 音高）。 */
export function playNote(midi, dur = 0.6) {
  ensureAudio();
  tone(440 * Math.pow(2, (midi - 69) / 12), { dur, type: 'triangle', gain: 0.25 });
}

/** 答对：上行分解和弦 C–E–G。 */
export function playCorrect() {
  ensureAudio();
  tone(523.25, { dur: 0.18, type: 'sine', gain: 0.25, when: 0 });
  tone(659.25, { dur: 0.18, type: 'sine', gain: 0.25, when: 0.09 });
  tone(783.99, { dur: 0.32, type: 'sine', gain: 0.28, when: 0.18 });
}

/** 答错：低音蜂鸣。 */
export function playWrong() {
  ensureAudio();
  tone(196, { dur: 0.28, type: 'sawtooth', gain: 0.1 });
  tone(147, { dur: 0.35, type: 'sawtooth', gain: 0.1, when: 0.12 });
}
