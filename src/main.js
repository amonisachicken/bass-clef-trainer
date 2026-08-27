// 应用主逻辑：模式切换、出题、作答判定、反馈、设置与统计联动。

import { StaffRenderer, drawCheatSheet } from './js/staff.js';
import { PianoRenderer } from './js/piano.js';
import { invoke, isTauri } from './js/api.js';
import { playNote, playCorrect, playWrong, ensureAudio } from './js/audio.js';
import { nameOf } from './js/notes.js';

const $ = (sel) => document.querySelector(sel);

const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];

const state = {
  settings: null,
  stats: null,
  mode: 'staffToPiano',
  question: null,
  answered: false,
  lastPick: null, // 用户上一次点击的琴键 / 音位
  timer: null,
};

const staff = new StaffRenderer($('#staffCanvas'), {
  onPick: (midi) => {
    state.lastPick = midi;
    answer({ midi });
  },
});
const piano = new PianoRenderer($('#pianoCanvas'), {
  onKey: (midi) => {
    state.lastPick = midi;
    answer({ midi });
  },
});

init();

async function init() {
  const profile = await invoke('get_profile');
  state.settings = profile.settings;
  state.stats = profile.stats;
  state.mode = profile.settings.mode || 'staffToPiano';
  // 音名问答模式已移除：旧存档若保存了该模式，回退到看谱弹键
  if (state.mode !== 'staffToPiano' && state.mode !== 'pianoToStaff') {
    state.mode = 'staffToPiano';
  }
  sanitizeRange(); // 防御：损坏/越界的音域回退到 F2–B3

  const badge = $('#envBadge');
  badge.hidden = false;
  badge.textContent = isTauri ? 'Tauri 桌面模式' : '浏览器预览模式';

  fillNoteSelects();
  bindControls();
  updateSettingsUI();
  applySettingsToRenderers();
  updateStatsUI();
  setMode(state.mode); // 内部会 newQuestion

  document.addEventListener('pointerdown', ensureAudio, { once: true });
  document.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && state.answered) {
      e.preventDefault();
      newQuestion();
    }
  });
  window.addEventListener('resize', () => {
    if (state.settings && state.settings.showCheatSheet) drawCheatSheet($('#cheatCanvas'));
  });
}

// ---------- 设置 ----------

function fillNoteSelects() {
  const opts = [];
  for (let m = 24; m <= 79; m++) {
    if (NATURAL_PCS.includes(m % 12)) {
      opts.push(`<option value="${m}">${nameOf(m)}</option>`);
    }
  }
  $('#minNote').innerHTML = opts.join('');
  $('#maxNote').innerHTML = opts.join('');
}

function bindControls() {
  $('#modeTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    setMode(btn.dataset.mode);
    state.settings.mode = state.mode;
    invoke('save_settings', { settings: state.settings }); // 记住上次模式
  });

  $('#minNote').addEventListener('change', () => {
    // 最低音不能高于最高音：若越界则把最高音同步上来
    const min = Number($('#minNote').value);
    if (min > state.settings.maxMidi) {
      state.settings.maxMidi = min;
      $('#maxNote').value = String(min);
    }
    state.settings.minMidi = min;
    syncRangeSelects();
    commitSettings();
  });
  $('#maxNote').addEventListener('change', () => {
    // 最高音不能低于最低音：若越界则把最低音同步下去
    const max = Number($('#maxNote').value);
    if (max < state.settings.minMidi) {
      state.settings.minMidi = max;
      $('#minNote').value = String(max);
    }
    state.settings.maxMidi = max;
    syncRangeSelects();
    commitSettings();
  });

  const toggles = [
    ['#optAccidentals', 'allowAccidentals'],
    ['#optLabels', 'showKeyLabels'],
    ['#optCheat', 'showCheatSheet'],
    ['#optSound', 'sound'],
    ['#optAutoNext', 'autoNext'],
  ];
  for (const [sel, key] of toggles) {
    $(sel).addEventListener('change', (e) => {
      state.settings[key] = e.target.checked;
      commitSettings();
    });
  }

  $('#resetStats').addEventListener('click', async () => {
    await invoke('reset_stats');
    state.stats = (await invoke('get_profile')).stats;
    updateStatsUI();
  });

  $('#nextBtn').addEventListener('click', newQuestion);
}

/** 防御：存档损坏/越界时回退到默认音域 F2–B3，并保证 min ≤ max。 */
function sanitizeRange() {
  let min = Number(state.settings.minMidi);
  let max = Number(state.settings.maxMidi);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 21 || max > 108) {
    min = 41;
    max = 59;
  }
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  state.settings.minMidi = min;
  state.settings.maxMidi = max;
}

/** 联动禁用：最低音里高于最高音的音、最高音里低于最低音的音置灰不可选。 */
function syncRangeSelects() {
  const min = state.settings.minMidi;
  const max = state.settings.maxMidi;
  for (const opt of $('#minNote').options) opt.disabled = Number(opt.value) > max;
  for (const opt of $('#maxNote').options) opt.disabled = Number(opt.value) < min;
}

async function commitSettings() {
  await invoke('save_settings', { settings: state.settings });
  applySettingsToRenderers();
  updateStatsUI();
  newQuestion();
}

function updateSettingsUI() {
  $('#minNote').value = String(state.settings.minMidi);
  $('#maxNote').value = String(state.settings.maxMidi);
  syncRangeSelects();
  $('#optAccidentals').checked = state.settings.allowAccidentals;
  $('#optLabels').checked = state.settings.showKeyLabels;
  $('#optCheat').checked = state.settings.showCheatSheet;
  $('#optSound').checked = state.settings.sound;
  $('#optAutoNext').checked = state.settings.autoNext;
}

function applySettingsToRenderers() {
  piano.setRange(state.settings.minMidi, state.settings.maxMidi, {
    labels: state.settings.showKeyLabels,
    useSharp: !state.settings.allowAccidentals,
  });
  staff.setRange(
    state.settings.minMidi,
    state.settings.maxMidi,
    state.settings.allowAccidentals,
  );
  staff.setInteractive(state.mode === 'pianoToStaff');
  $('#pianoHint').textContent =
    `键盘范围：${nameOf(state.settings.minMidi)} – ${nameOf(state.settings.maxMidi)}`;
  $('#cheatCard').hidden = !state.settings.showCheatSheet;
  if (state.settings.showCheatSheet) drawCheatSheet($('#cheatCanvas'));
}

// ---------- 模式与出题 ----------

function setMode(mode) {
  state.mode = mode;
  for (const btn of document.querySelectorAll('.mode-btn')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
  staff.setInteractive(mode === 'pianoToStaff');
  newQuestion();
}

async function newQuestion() {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.answered = false;
  state.lastPick = null;
  hideFeedback();
  $('#nextBtn').hidden = true;

  const q = await invoke('generate_question', { mode: state.mode });
  state.question = q;

  if (q.mode === 'staffToPiano') {
    staff.showQuestion(q.midi);
    piano.clearFeedback();
    setHint('谱表上显示了一个音——点击下方钢琴上对应的琴键');
  } else if (q.mode === 'pianoToStaff') {
    staff.showEmpty();
    piano.highlight(q.midi);
    if (state.settings.sound) playNote(q.midi, 0.4);
    setHint('高亮的琴键是哪个音？点击上方谱表中它的位置');
  }
}

// ---------- 作答 ----------

async function answer(input) {
  if (state.answered || !state.question) return;
  state.answered = true;
  const q = state.question; // 在 await 前捕获，避免期间换题导致显示错位
  ensureAudio();
  let result;
  try {
    result = await invoke('submit_answer', { input });
  } catch (e) {
    // 兜底：提交失败时给用户可见提示，而不是静默无反应
    console.error('提交答案失败:', e);
    state.answered = false;
    showFeedback('提交失败，请再试一次', 'bad');
    $('#nextBtn').hidden = false;
    return;
  }
  state.stats = result.stats;
  updateStatsUI();

  if (result.correct) {
    showFeedback(`✓ 正确！${result.correctName}`, 'ok');
    if (state.settings.sound) playCorrect();
    if (result.mode === 'staffToPiano') piano.showFeedback(q.midi);
    if (result.mode === 'pianoToStaff') staff.showAnswer(q.midi);
    if (state.settings.autoNext) {
      state.timer = setTimeout(newQuestion, 750);
    } else {
      $('#nextBtn').hidden = false;
    }
  } else {
    showFeedback(`✗ 正确答案是 ${result.correctName}`, 'bad');
    if (state.settings.sound) playWrong();
    if (result.mode === 'staffToPiano') piano.showFeedback(result.correctMidi, state.lastPick);
    if (result.mode === 'pianoToStaff') staff.showAnswer(result.correctMidi, state.lastPick);
    $('#nextBtn').hidden = false;
  }
}

// ---------- UI 辅助 ----------

function showFeedback(text, kind) {
  const el = $('#feedback');
  el.hidden = false;
  el.textContent = text;
  el.className = 'feedback ' + kind;
}

function hideFeedback() {
  $('#feedback').hidden = true;
}

function setHint(text) {
  $('#staffHint').textContent = text;
}

const todayKey = () => String(Math.floor(Date.now() / 1000 / 86400));

function updateStatsUI() {
  const s = state.stats;
  const acc = s.totalAttempts ? ((s.correct / s.totalAttempts) * 100).toFixed(1) : '—';
  $('#acc').textContent = acc + '%';
  $('#streak').textContent = s.currentStreak;
  $('#attempts').textContent = s.totalAttempts;

  const today = s.byDay[todayKey()] || { attempts: 0, correct: 0 };
  const todayAcc = today.attempts ? ((today.correct / today.attempts) * 100).toFixed(1) : '—';
  $('#statToday').textContent = todayAcc + '%';
  $('#statTotal').textContent = acc + '%';
  $('#statBest').textContent = s.bestStreak;
  $('#statAttempts').textContent = s.totalAttempts;
}
