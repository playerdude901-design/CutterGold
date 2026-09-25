import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { categoryFor, scoreAnswers, reviewKey, formatDuration, localSuggestion } from '../src/clipscore/model.ts';
import { moveExport, reserveOutput, safeName } from '../electron/clip-files.ts';

test('all 144 answer combinations produce integer scores 0–10; incomplete reviews stay unclassified', () => {
  const scores = new Set<number>();
  for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) for (let e = 0; e < 2; e++) {
    const score = scoreAnswers([a, b, c, d, e]);
    assert.ok(score !== null && Number.isInteger(score) && score >= 0 && score <= 10);
    scores.add(score);
  }
  assert.equal(scores.size, 11);
  assert.equal(scoreAnswers([]), null);
  assert.equal(scoreAnswers([0, 0, undefined, 0, 0]), null);
  assert.equal(scoreAnswers([4, 0, 0, 0, 0]), null);
  assert.equal(scoreAnswers([0, 0, 0, 0, 0]), 10);
  assert.equal(scoreAnswers([3, 1, 2, 2, 1]), 0);
});
test('category boundaries and total durations', () => {
  assert.deepEqual([0, 1, 2, 4, 5, 7, 8, 10].map(categoryFor), ['Descartar', 'Descartar', 'Dudoso', 'Dudoso', 'Bueno', 'Bueno', 'Excelente', 'Excelente']);
  assert.equal(formatDuration(3599.9), '60:00');
  assert.equal(formatDuration(65), '01:05');
  assert.match(localSuggestion({ Excelente: 0, Bueno: 0, Dudoso: 4, Descartar: 1 }), /Todavía no/);
});
test('review identity follows source and boundaries, preserving answers after color edits', () => {
  const clip = { id: 'a', startTime: 1, endTime: 5, color: 'Red', colorValue: '#f00' };
  assert.equal(reviewKey('a.mp4', clip), reviewKey('a.mp4', { ...clip, color: 'Blue' }));
  assert.notEqual(reviewKey('a.mp4', clip), reviewKey('a.mp4', { ...clip, endTime: 6 }));
  assert.notEqual(reviewKey('a.mp4', clip), reviewKey('b.mp4', clip));
});
test('file moves preserve exact bytes, avoid collisions, and are repeatable', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cuttergold-test-'));
  try {
    const original = path.join(root, 'source.mp4');
    await fs.writeFile(original, 'original video');
    const clip = await reserveOutput(root, 'clip', '.mp4');
    await fs.writeFile(clip, 'clip bytes');
    const directory = path.join(root, 'Excelente');
    const collision = await reserveOutput(directory, 'clip', '.mp4');
    await fs.writeFile(collision, 'previous export');
    const moved = await moveExport(clip, directory);
    assert.notEqual(moved, collision);
    assert.equal(await fs.readFile(moved, 'utf8'), 'clip bytes');
    assert.equal(await fs.readFile(collision, 'utf8'), 'previous export');
    assert.equal(await fs.readFile(original, 'utf8'), 'original video');
    await assert.rejects(fs.access(clip));
    assert.equal(await moveExport(moved, directory), moved);
    const outputs = await Promise.all(Array.from({ length: 8 }, () => reserveOutput(root, 'same', '.mp4')));
    assert.equal(new Set(outputs).size, 8);
    assert.equal(safeName('../CON'), '.._CON');
    assert.equal(safeName('CON'), 'clip');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
