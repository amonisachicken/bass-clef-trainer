// 应用主逻辑：模式切换、出题、作答判定、反馈、设置与统计联动。

import { StaffRenderer, drawCheatSheet } from './js/staff.js';
import { PianoRenderer } from './js/piano.js';
import { invoke, isTauri } from './js/api.js';
import { playNote, playCorrect, playWrong, ensureAudio } from './js/audio.js';
import { nameOf } from './js/notes.js';

const $ = (sel) => document.querySelector(sel);

const PRESETS = {
  basic: { min: 36, max: 60 },    // C2 – C4
  advanced: { min: 36, max: 64 }, // C2 – E4
};

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
      nextQuestion();
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

  $('#rangePreset').addEventListener('change', (e) => {
    const v = e.target.value;
    $('#customRange').hidden = v !== 'custom';
    if (v === 'custom') {
      applyCustomFromSelects();
    } else if (PRESETS[v]) {
      state.settings.minMidi = PRESETS[v].min;
      state.settings.maxMidi = PRESETS[v].max;
    }
    state.settings.rangePreset = v;
    commitSettings();
  });

  $('#minNote').addEventListener('change', () => {
    applyCustomFromSelects();
    commitSettings();
  });
  $('#maxNote').addEventListener('change', () => {
    applyCustomFromSelects();
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

  $('#nextBtn').addEventListener('click', nextQuestion);
}

function applyCustomFromSelects() {
  let min = Number($('#minNote').value);
  let max = Number($('#maxNote').value);
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  state.settings.minMidi = min;
  state.settings.maxMidi = max;
}

async function commitSettings() {
  await invoke('save_settings', { settings: state.settings });
  applySettingsToRenderers();
  updateStatsUI();
  newQuestion();
}

function updateSettingsUI() {
  $('#rangePreset').value = state.settings.rangePreset || 'basic';
  $('#customRange').hidden = (state.settings.rangePreset || 'basic') !== 'custom';
  $('#minNote').value = String(state.settings.minMidi);
  $('#maxNote').value = String(state.settings.maxMidi);
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
  $('#nameOptions').hidden = mode !== 'name';
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
  $('#nameOptions').innerHTML = '';

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
  } else {
    staff.showQuestion(q.midi);
    piano.clearFeedback();
    renderOptions(q);
    setHint('这个音符叫什么名字？选择正确的音名');
  }
}

// ---------- 作答 ----------

async function answer(input) {
  if (state.answered || !state.question) return;
  state.answered = true;
  const q = state.question; // 在 await 前捕获，避免期间换题导致显示错位
  ensureAudio();
  const result = await invoke('submit_answer', { input });
  state.stats = result.stats;
  updateStatsUI();

  if (result.correct) {
    showFeedback(`✓ 正确！${result.correctName}`, 'ok');
    if (state.settings.sound) playCorrect();
    if (result.mode === 'staffToPiano') piano.showFeedback(q.midi);
    if (result.mode === 'pianoToStaff') staff.showAnswer(q.midi);
    if (result.mode === 'name') markOptions(true, result.correctName);
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
    if (result.mode === 'name') markOptions(false, result.correctName);
    $('#nextBtn').hidden = false;
  }
}

function renderOptions(q) {
  const box = $('#nameOptions');
  box.innerHTML = '';
  for (const name of q.options) {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      btn.classList.add('picked');
      answer({ name });
    });
    box.appendChild(btn);
  }
}

function markOptions(correct, correctName) {
  for (const b of document.querySelectorAll('#nameOptions .option-btn')) {
    b.disabled = true;
    if (b.textContent === correctName) {
      b.classList.add('ok');
    } else if (!correct && b.classList.contains('picked')) {
      b.classList.add('bad');
    }
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
