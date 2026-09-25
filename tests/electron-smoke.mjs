// Run after npm run build: node_modules/.bin/electron tests/electron-smoke.mjs
import { app, BrowserWindow, dialog } from 'electron';
import updater from 'electron-updater';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import ffmpeg from 'ffmpeg-static';

async function run() {
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cuttergold-smoke-'));
app.setPath('userData', path.join(root, 'profile'));
updater.autoUpdater.checkForUpdatesAndNotify = async () => null;
const source = path.join(root, 'test.mp4');
const output = path.join(root, 'output');
await fs.mkdir(output);
execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source], { stdio: 'ignore', windowsHide: true });
dialog.showOpenDialog = async options => ({ canceled: false, filePaths: [options.properties.includes('openFile') ? source : output] });
let window;
async function evaluate(code) { return window.webContents.executeJavaScript(code, true); }
async function until(code) {
  for (let i = 0; i < 160; i++) {
    if (await evaluate(code)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${code}`);
}
const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
try {
  await import('../dist-electron/electron/main.js');
  await app.whenReady();
  window = BrowserWindow.getAllWindows()[0];
  await until(`Boolean(document.querySelector('.app-container'))`);
  await click('Enterado');
  await click('Seleccionar Video');
  await until(`document.querySelector('video')?.duration > 10`);
  await click('Add Clip');
  await evaluate(`document.querySelector('video').currentTime = 6; document.querySelector('video').dispatchEvent(new Event('timeupdate'))`);
  await click('Add Clip');
  await click('Revisar clips');
  await until(`Boolean(document.querySelector('.cs-dialog[open]'))`);
  assert.equal(await evaluate(`document.querySelector('.cs-footer button:last-child').disabled`), true);
  await until(`document.querySelector('.cs-preview video').currentTime > 0`);
  await evaluate(`const v = document.querySelector('.cs-preview video'); v.currentTime = 5; v.dispatchEvent(new Event('timeupdate'))`);
  await until(`document.querySelector('.cs-preview video').paused && document.querySelector('.cs-preview video').currentTime < 0.1`);
  await click('Silenciar');
  assert.equal(await evaluate(`document.querySelector('.cs-preview video').muted`), true);
  for (let i = 0; i < 5; i++) await evaluate(`document.querySelectorAll('fieldset')[${i}].querySelector('button').click()`);
  await until(`document.querySelector('.cs-score').textContent.includes('10/10')`);
  await click('Siguiente →');
  await until(`document.querySelector('.cs-preview video')?.currentTime >= 6`);
  for (let i = 0; i < 5; i++) await evaluate(`Array.from(document.querySelectorAll('fieldset')[${i}].querySelectorAll('button')).at(-1).click()`);
  await until(`document.querySelector('.cs-score').textContent.includes('0/10')`);
  await click('← Anterior');
  assert.match(await evaluate(`document.querySelector('.cs-score').textContent`), /10\/10/);
  await click('Siguiente →');
  await click('Ver resumen');
  await until(`Boolean(document.querySelector('.cs-categories'))`);
  assert.match(await evaluate(`document.querySelector('.cs-summary-panel h2').textContent`), /00:10/);
  await evaluate(`document.querySelectorAll('.cs-category')[3].click()`);
  await until(`document.querySelector('.cs-summary-panel h2').textContent.includes('00:05')`);
  await evaluate(`document.querySelectorAll('.cs-category')[3].click()`);
  await fs.mkdir('test-artifacts', { recursive: true });
  await evaluate(`new Promise(r => setTimeout(r, 400))`);
  await fs.writeFile('test-artifacts/clipscore-summary.png', (await window.webContents.capturePage()).toPNG());
  window.setSize(900, 600);
  await evaluate(`new Promise(r => setTimeout(r, 200))`);
  assert.equal(await evaluate(`document.querySelector('.cs-footer button:last-child').getBoundingClientRect().bottom <= innerHeight`), true);
  window.setSize(1280, 820);
  await click('Exportar clips');
  await until(`document.querySelector('.cs-status').textContent.includes('2 clips guardados')`);
  const excellent = (await fs.readdir(path.join(output, 'Excelente')))[0];
  const discarded = (await fs.readdir(path.join(output, 'Descartar')))[0];
  assert.ok(excellent && discarded);
  const beforeMove = await fs.readFile(path.join(output, 'Excelente', excellent));
  await click('← Revisar respuestas');
  await click('← Anterior');
  await evaluate(`document.querySelectorAll('fieldset')[0].querySelectorAll('button')[1].click()`);
  await evaluate(`document.querySelectorAll('fieldset')[1].querySelectorAll('button')[1].click()`);
  await until(`document.querySelector('.cs-score').textContent.includes('7/10')`);
  await until(`document.querySelector('.cs-preview video')?.readyState >= 2`);
  await evaluate(`new Promise(r => setTimeout(r, 400))`);
  await fs.writeFile('test-artifacts/clipscore-review.png', (await window.webContents.capturePage()).toPNG());
  await click('Siguiente →');
  await click('Ver resumen');
  await click('Exportar clips');
  await until(`document.querySelector('.cs-status').textContent.includes('2 clips guardados')`);
  assert.equal((await fs.readdir(path.join(output, 'Excelente'))).length, 0);
  const good = (await fs.readdir(path.join(output, 'Bueno')))[0];
  assert.deepEqual(await fs.readFile(path.join(output, 'Bueno', good)), beforeMove);
  assert.equal((await fs.readdir(path.join(output, 'Descartar'))).length, 1);
  await fs.access(source);
  await click('Editar selección');
  assert.equal(await evaluate(`Boolean(document.querySelector('.cs-dialog'))`), false);
  await click('Revisar clips');
  await until(`document.querySelector('.cs-score')?.textContent.includes('7/10')`);
  await click('Editar selección');
  await click('Settings');
  await until(`Boolean(document.querySelector('.cs-settings'))`);
  const settings = await evaluate(`window.api.getClipScoreSettings()`);
  assert.equal(settings.configured, false);
  await evaluate(`window.api.saveClipScoreSettings({ apiKey: 'test-key-not-a-real-key', model: '' })`);
  assert.equal((await evaluate(`window.api.getClipScoreSettings()`)).configured, true);
  assert.ok(!(await fs.readFile(path.join(root, 'profile', 'clipscore-settings.json'), 'utf8')).includes('test-key-not-a-real-key'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.ok(!JSON.stringify(body).includes(source));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Sugerencia de prueba.' } }] }), { status: 200 });
  };
  assert.equal((await evaluate(`window.api.clipScoreSuggestion({ counts: {Excelente: 1, Bueno: 0, Dudoso: 0, Descartar: 1}, duration: 10 })`)).text, 'Sugerencia de prueba.');
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.ok((await evaluate(`window.api.clipScoreSuggestion({ counts: {Excelente: 1, Bueno: 0, Dudoso: 0, Descartar: 1}, duration: 10 })`)).error);
  globalThis.fetch = originalFetch;
  await evaluate(`window.api.saveClipScoreSettings({ apiKey: '', model: '' })`);
  const invalid = await evaluate(`window.api.exportClips({ videoPath: ${JSON.stringify(source)}, outputDir: ${JSON.stringify(output)}, quality: 'source', clips: [{id:'invalid',color:'Red',startTime:5,endTime:2}] })`);
  assert.equal(invalid.success, false);
  const cancelled = await evaluate(`(async () => {
    const promise = window.api.exportClips({exportId:'smoke-cancel',videoPath:${JSON.stringify(source)},outputDir:${JSON.stringify(output)},quality:'fhd',clips:[{id:'cancel',color:'Red',startTime:0,endTime:12}]});
    await new Promise(r=>setTimeout(r,50)); await window.api.cancelExport('smoke-cancel'); return promise;
  })()`);
  assert.equal(cancelled.cancelled, true);
  assert.equal((await fs.readdir(path.join(output, 'Red'))).length, 0);
  console.log('PASS: real Electron UI, playback, scoring, navigation, summary, FFmpeg export, byte-preserving moves, repeat export, settings encryption, invalid ranges and cancellation.');
  app.exit(0);
} catch (error) {
  console.error(error);
  app.exit(1);
}

}
void run().catch(error => { console.error(error); app.exit(1); });
