// Run after npm run build: npx electron scripts/capture-interface.mjs
// Captures the real application with generated media; never opens personal files.
import { app, BrowserWindow, dialog } from 'electron';
import updater from 'electron-updater';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'cuttergold-interface-'));
app.setPath('userData', path.join(temporary, 'profile'));
updater.autoUpdater.checkForUpdatesAndNotify = async () => null;
const source = path.join(temporary, 'OBS-demo-dos-pistas.mp4');
const destination = 'assets/images';
try {
  execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'aevalsrc=0.65*sin(2*PI*440*t)*sin(PI*t/3)^4:s=48000',
    '-f', 'lavfi', '-i', 'aevalsrc=0.45*sin(2*PI*900*t)*sin(PI*t/1.3)^2*lt(mod(t\\,8)\\,5):s=48000',
    '-map', '0:v', '-map', '1:a', '-map', '2:a', '-t', '24', '-c:v', 'libx264',
    '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source], { stdio: 'ignore', windowsHide: true });
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
  await import('../dist-electron/electron/main.js');
  await app.whenReady();
  const window = BrowserWindow.getAllWindows()[0];
  window.setContentSize(1600, 1000);
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let i = 0; i < 300; i++) {
      if (await evaluate(code)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Timed out: ' + code);
  };
  const click = label => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
  await until("Boolean(document.querySelector('.app-container'))");
  await click('Enterado');
  await click('Seleccionar Video');
  await until("document.querySelectorAll('.audio-track-lane audio').length === 2 && !document.querySelector('.audio-analysis-progress')");
  for (const time of [1, 9, 17]) {
    await evaluate(`document.querySelector('video').currentTime = ${time}; document.querySelector('video').dispatchEvent(new Event('timeupdate'))`);
    await click('Add Clip');
  }
  await evaluate("document.querySelector('video').currentTime = 10; document.querySelector('video').dispatchEvent(new Event('timeupdate'))");
  await until("!document.querySelector('video').seeking");
  await new Promise(resolve => setTimeout(resolve, 500));
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(destination, 'cuttergold-0.1.0-editor.png'), (await window.webContents.capturePage()).toPNG());
  const rectangle = await evaluate("(() => { const r = document.querySelector('.timeline-container').getBoundingClientRect(); return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.floor(r.width), height: Math.floor(r.height) }; })()");
  await fs.writeFile(path.join(destination, 'cuttergold-0.1.0-waveforms.png'), (await window.webContents.capturePage(rectangle)).toPNG());
  console.log('Captured actual editor and two-track waveforms in ' + destination);
  window.destroy();
  await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
  app.exit(0);
} catch (error) {
  console.error(error);
  app.exit(1);
}
