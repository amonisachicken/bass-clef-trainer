// 乐理换算工具：与 Rust 核心库（core/src/notes.rs）保持一致的逻辑。
// 浏览器降级模式（无 Tauri 时）与前端渲染都会用到。

const SHARP_TABLE = {
  0: ['C', ''], 1: ['C', '#'], 2: ['D', ''], 3: ['D', '#'], 4: ['E', ''],
  5: ['F', ''], 6: ['F', '#'], 7: ['G', ''], 8: ['G', '#'], 9: ['A', ''],
  10: ['A', '#'], 11: ['B', ''],
};
const FLAT_TABLE = {
  0: ['C', ''], 1: ['D', 'b'], 2: ['D', ''], 3: ['E', 'b'], 4: ['E', ''],
  5: ['F', ''], 6: ['G', 'b'], 7: ['G', ''], 8: ['A', 'b'], 9: ['A', ''],
  10: ['B', 'b'], 11: ['B', ''],
};
const STEP_OF_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // 每个半音音级对应的全音阶步数
const PC_OF_STEP = [0, 2, 4, 5, 7, 9, 11];              // 全音阶步数 → 半音音级

// G2 的全音阶位置（diatonicIndex(43)）
export const BASS_LINE1_DIATONIC = 25;

/** MIDI 音高 → 音名，如 60 → "C4"、61 → "C#4"（useSharp=false 时为 "Db4"）。 */
export function nameOf(midi, useSharp = true) {
  const table = useSharp ? SHARP_TABLE : FLAT_TABLE;
  const [letter, acc] = table[midi % 12];
  return letter + acc + (Math.floor(midi / 12) - 1);
}

/** 全音阶位置：C=0, D=1, …, B=6，每八度 +7。 */
export function diatonicIndex(midi) {
  return Math.floor(midi / 12) * 7 + STEP_OF_PC[midi % 12];
}

/** 相对低音谱表的音位：0 = 一线 G2，1 = 一间 A2，…；负数向下，≥10 向上。 */
export function staffPosition(midi) {
  return diatonicIndex(midi) - BASS_LINE1_DIATONIC;
}

/** staffPosition 的反函数（音位 → MIDI）。 */
export function midiFromPosition(pos) {
  const d = pos + BASS_LINE1_DIATONIC;
  const oct = Math.floor(d / 7);
  return oct * 12 + PC_OF_STEP[d - oct * 7];
}

/** 是否落在线上（偶数 = 线，奇数 = 间）。 */
export function isOnLine(pos) {
  return pos % 2 === 0;
}

/** 下加线数量。 */
export function ledgerBelow(pos) {
  return pos <= -2 ? Math.floor((-pos + 1) / 2) : 0;
}

/** 上加线数量。 */
export function ledgerAbove(pos) {
  return pos >= 10 ? Math.floor((pos - 10) / 2) + 1 : 0;
}

/** 是否白键（自然音）。 */
export function isNatural(midi) {
  return [0, 2, 4, 5, 7, 9, 11].includes(midi % 12);
}

/** MIDI 音高 → 频率（Hz），A4 = 440Hz。 */
export function freqOf(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
