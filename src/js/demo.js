// 浏览器降级模式：未运行在 Tauri 中时，用纯 JS 复刻核心逻辑并持久化到 localStorage。
// 桌面应用中不会走到这里——权威逻辑在 Rust 核心库（core/），本文件仅为浏览器预览提供等价行为。

import { nameOf, isNatural } from './notes.js';

const KEY = 'bass-clef-profile-v1';

const DEFAULT_SETTINGS = {
  minMidi: 41,
  maxMidi: 59,
  allowAccidentals: false,
  showKeyLabels: true,
  showCheatSheet: false,
  sound: true,
  autoNext: true,
  mode: 'staffToPiano',
};

function emptyStats() {
  return {
    totalAttempts: 0,
    correct: 0,
    wrong: 0,
    currentStreak: 0,
    bestStreak: 0,
    byMode: {},
    byDay: {},
  };
}

function defaultProfile() {
  return { settings: { ...DEFAULT_SETTINGS }, stats: emptyStats() };
}

let current = null;
let nextId = 1;

// 内存缓存：localStorage 不可用（如 Node 测试环境）时仍能保证同一会话内状态连续。
let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      cache = {
        settings: { ...DEFAULT_SETTINGS, ...p.settings },
        stats: p.stats || emptyStats(),
      };
      return cache;
    }
  } catch {
    // localStorage 不可用或数据损坏
  }
  cache = defaultProfile();
  return cache;
}

function save(profile) {
  cache = profile;
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // 忽略写入失败
  }
}

const todayKey = () => String(Math.floor(Date.now() / 1000 / 86400));

function record(stats, mode, correct) {
  stats.totalAttempts += 1;
  if (correct) {
    stats.correct += 1;
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.wrong += 1;
    stats.currentStreak = 0;
  }
  const ms = stats.byMode[mode] || (stats.byMode[mode] = { attempts: 0, correct: 0 });
  ms.attempts += 1;
  if (correct) ms.correct += 1;
  const ds = stats.byDay[todayKey()] || (stats.byDay[todayKey()] = { attempts: 0, correct: 0 });
  ds.attempts += 1;
  if (correct) ds.correct += 1;
}

function pickMidi(settings) {
  const min = settings.minMidi;
  const max = settings.maxMidi;
  for (;;) {
    const m = min + Math.floor(Math.random() * (max - min + 1));
    if (settings.allowAccidentals || isNatural(m)) return m;
  }
}

function generateQuestion(settings, mode) {
  const midi = pickMidi(settings);
  const question = {
    id: nextId++,
    mode,
    midi,
    name: nameOf(midi, true),
  };
  current = question;
  return question;
}

function checkAnswer(question, input) {
  return input.midi === question.midi;
}

/** 与 Rust 命令同名的降级实现。 */
export async function invoke(cmd, args = {}) {
  switch (cmd) {
    case 'get_profile': {
      return JSON.parse(JSON.stringify(load()));
    }
    case 'save_settings': {
      const p = load();
      p.settings = { ...DEFAULT_SETTINGS, ...args.settings };
      save(p);
      // 与 Rust 侧一致：不清空当前题目，避免与 generate_question 竞态
      return null;
    }
    case 'generate_question': {
      const p = load();
      return generateQuestion(p.settings, args.mode);
    }
    case 'submit_answer': {
      const p = load();
      if (!current) throw new Error('当前没有待回答的题目');
      const correct = checkAnswer(current, args.input);
      record(p.stats, current.mode, correct);
      save(p);
      return {
        correct,
        correctName: current.name,
        correctMidi: current.midi,
        mode: current.mode,
        stats: JSON.parse(JSON.stringify(p.stats)),
      };
    }
    case 'reset_stats': {
      const p = load();
      p.stats = emptyStats();
      save(p);
      return null;
    }
    default:
      throw new Error('未知命令: ' + cmd);
  }
}
