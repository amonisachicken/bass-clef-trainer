// 前端乐理换算逻辑的单元测试（与 Rust 核心库测试相互印证）。
// 运行: node --test test/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nameOf,
  staffPosition,
  midiFromPosition,
  isNatural,
  ledgerBelow,
  ledgerAbove,
} from '../src/js/notes.js';

test('音名换算', () => {
  assert.equal(nameOf(60, true), 'C4');
  assert.equal(nameOf(36, true), 'C2');
  assert.equal(nameOf(43, true), 'G2');
  assert.equal(nameOf(52, true), 'E3');
  assert.equal(nameOf(59, true), 'B3');
  assert.equal(nameOf(21, true), 'A0');
  assert.equal(nameOf(61, true), 'C#4');
  assert.equal(nameOf(61, false), 'Db4');
  assert.equal(nameOf(70, true), 'A#4');
  assert.equal(nameOf(70, false), 'Bb4');
});

test('低音谱表位置', () => {
  const expect = {
    43: 0, 45: 1, 47: 2, 48: 3, 50: 4, 52: 5,
    53: 6, 55: 7, 57: 8, 59: 9, 60: 10,
    36: -4, 40: -2,
  };
  for (const [midi, pos] of Object.entries(expect)) {
    assert.equal(staffPosition(Number(midi)), pos, `midi=${midi}`);
  }
});

test('位置反函数（往返一致）', () => {
  for (let m = 24; m <= 79; m++) {
    if (!isNatural(m)) continue;
    assert.equal(midiFromPosition(staffPosition(m)), m, `midi=${m}`);
  }
});

test('加线数量', () => {
  assert.equal(ledgerBelow(0), 0);
  assert.equal(ledgerBelow(-2), 1);
  assert.equal(ledgerBelow(-4), 2);
  assert.equal(ledgerAbove(9), 0);
  assert.equal(ledgerAbove(10), 1);
  assert.equal(ledgerAbove(12), 2);
});

test('降级模式答题流程', async () => {
  const { invoke } = await import('../src/js/demo.js');
  const q = await invoke('generate_question', { mode: 'staffToPiano' });
  assert.ok(q.midi >= 41 && q.midi <= 59, `默认音域应为 F2–B3，得到 ${q.midi}`);
  assert.ok(q.name.length >= 2);

  const r1 = await invoke('submit_answer', { input: { midi: q.midi } });
  assert.equal(r1.correct, true);
  assert.equal(r1.stats.totalAttempts, 1);

  const r2 = await invoke('submit_answer', { input: { midi: 60 } });
  assert.equal(typeof r2.correct, 'boolean');
  assert.equal(r2.stats.totalAttempts, 2);
});
