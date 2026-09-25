import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import ytDlp from 'yt-dlp-exec';
import pkg from 'electron-updater';
import { registerClipScoreSettings } from './clipscore-settings.js';
import { categoryNames, moveExport, reserveOutput, safeName } from './clip-files.js';
import { randomUUID } from 'node:crypto';
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Match the identity embedded in the installer and Windows shortcuts.
if (process.platform === 'win32') app.setAppUserModelId('com.cuttergold.app');

let mainWindow: BrowserWindow | null = null;
const ffmpegProcesses = new Map<string, ChildProcessWithoutNullStreams>();

function createWindow(): void {
  const possibleIconPaths = [
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    path.join(app.getAppPath(), 'icon.png'),
    path.join(__dirname, '../../icon.png'),
    path.join(__dirname, '../icon.png'),
    path.join(process.resourcesPath, 'icon.png')
  ];
  const iconPath = possibleIconPaths.find(p => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'CutterGold',
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: fs.existsSync(path.join(__dirname, 'preload.js'))
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, 'preload.ts'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    const possibleHtmlPaths = [
      path.join(app.getAppPath(), 'dist/index.html'),
      path.join(__dirname, '../../dist/index.html'),
      path.join(__dirname, '../dist/index.html'),
      path.join(__dirname, 'dist/index.html')
    ];
    const htmlPath = possibleHtmlPaths.find(p => fs.existsSync(p));
    if (htmlPath) {
      mainWindow.loadFile(htmlPath);
    } else {
      mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html')).catch(err => {
        console.error('Failed to load html:', err);
      });
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getBinaryPath(binaryName: string): string {
  const isWin = process.platform === 'win32';
  const execName = isWin ? `${binaryName}.exe` : binaryName;
  
  const possiblePaths = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'yt-dlp-exec', 'bin', execName),
    path.join(process.resourcesPath, 'extraResources', execName),
    path.join(__dirname, '..', '..', 'node_modules', 'yt-dlp-exec', 'bin', execName),
    path.join(__dirname, '..', 'node_modules', 'yt-dlp-exec', 'bin', execName),
    path.join(app.getAppPath(), 'node_modules', 'yt-dlp-exec', 'bin', execName),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p) && !p.includes('app.asar' + path.sep) && !p.endsWith('app.asar')) {
      return p;
    }
  }
  
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'yt-dlp-exec', 'bin', execName);
}

function getFfmpegPath(): string {
  const isWin = process.platform === 'win32';
  const execName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

  // 1. If ffmpeg-static provides a path, prioritize replacing app.asar with app.asar.unpacked
  if (typeof ffmpegStatic === 'string') {
    const unpacked = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
  }

  // 2. Check unpacked / resources / dev paths
  const possiblePaths = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', execName),
    path.join(process.resourcesPath, 'extraResources', execName),
    path.join(__dirname, '..', '..', 'node_modules', 'ffmpeg-static', execName),
    path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', execName),
    path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', execName),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && !p.includes('app.asar' + path.sep) && !p.endsWith('app.asar')) {
      return p;
    }
  }

  // 3. Fallback for unpacked dev mode
  if (typeof ffmpegStatic === 'string' && !ffmpegStatic.includes('app.asar') && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }

  return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', execName);
}

interface ClipData {
  id: string;
  startTime: number;
  endTime: number;
  color: string;
  colorValue: string;
  category?: string;
}

interface ExportProgress {
  current: number;
  total: number;
  status: 'processing' | 'done' | 'error' | 'cancelled';
  files?: string[];
  error?: string;
}

app.whenReady().then(() => {
  createWindow();
  registerClipScoreSettings();

  autoUpdater.autoDownload = false;
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    if (!mainWindow) return;
    dialog.showMessageBox({
      type: 'info',
      title: 'Actualización Disponible',
      message: 'Una nueva versión de CutterGold está disponible. ¿Deseas descargarla e instalarla ahora?',
      buttons: ['Sí, descargar', 'No, gracias']
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-downloaded', () => {
    if (!mainWindow) return;
    dialog.showMessageBox({
      type: 'info',
      title: 'Actualización lista',
      message: 'La actualización se ha descargado y está lista para instalarse. ¿Deseas reiniciar ahora?',
      buttons: ['Reiniciar y Actualizar', 'Más tarde']
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const [, proc] of ffmpegProcesses) {
    proc.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

// 1. Select a video file
ipcMain.handle('select-video', async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar Video',
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// 2. Select an output directory
ipcMain.handle('select-output-dir', async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Selecciona la carpeta de destino para guardar los clips',
    buttonLabel: 'Seleccionar Carpeta',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// 2.5. Get Stream URL (Twitch/YouTube)
interface StreamFormat {
  format_id: string;
  format_note: string;
  height: number;
  fps: number;
  url: string;
}

interface StreamUrlResult {
  success: boolean;
  url?: string;
  formats?: StreamFormat[];
  error?: string;
}

ipcMain.handle('get-stream-url', async (_event: IpcMainInvokeEvent, url: string): Promise<StreamUrlResult> => {
  if (!url || typeof url !== 'string') {
    return { success: false, error: 'URL inválida' };
  }
  
  try {
    const binaryPath = getBinaryPath('yt-dlp');
    const customYtDlp = (ytDlp as any).create(binaryPath);
    const result = await customYtDlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
    });

    let formats: StreamFormat[] = [];
    if (result.formats) {
      formats = result.formats
        .filter((f: any) => f.vcodec !== 'none' && f.url)
        .map((f: any) => ({
          format_id: f.format_id,
          format_note: f.format_note || f.format_id,
          height: f.height || 0,
          fps: f.fps || 0,
          url: f.url
        }))
        .sort((a: StreamFormat, b: StreamFormat) => {
          if (b.height !== a.height) return b.height - a.height;
          return b.fps - a.fps;
        });
    }

    return { success: true, url: result.url, formats };
  } catch (err: any) {
    console.error('yt-dlp error:', err);
    return { success: false, error: err?.message || 'Error al obtener stream' };
  }
});

// 3. Export clips
interface ExportClipsParams {
  exportId?: string;
  videoPath: string;
  outputDir: string;
  clips: ClipData[];
  quality: 'source' | 'hd' | 'fhd';
}

interface ExportResult {
  success: boolean;
  files?: string[];
  error?: string;
  cancelled?: boolean;
}

// Only paths produced by this process are eligible for moving; never accept a
// renderer-supplied original path. Range and quality changes invalidate reuse.
const exportedFiles = new Map<string, string>();
const exportJobs = new Map<string, { cancelled: boolean }>();

ipcMain.handle('export-clips', async (event: IpcMainInvokeEvent, params: ExportClipsParams): Promise<ExportResult> => {
  const { videoPath, outputDir, clips, quality } = params;
  if (exportJobs.size) return { success: false, error: 'Ya hay una exportación en curso' };
  if (typeof videoPath !== 'string' || !videoPath || typeof outputDir !== 'string' || !path.isAbsolute(outputDir) ||
      !Array.isArray(clips) || !clips.length || !['source', 'hd', 'fhd'].includes(quality) ||
      clips.some(c => !c || typeof c.id !== 'string' || typeof c.color !== 'string' ||
        !Number.isFinite(c.startTime) || !Number.isFinite(c.endTime) || c.startTime < 0 || c.endTime <= c.startTime ||
        (c.category !== undefined && !categoryNames.includes(c.category)))) {
    return { success: false, error: 'Parámetros inválidos para exportación' };
  }
  const exportId = params.exportId || randomUUID();
  const job = { cancelled: false };
  exportJobs.set(exportId, job);
  const results: string[] = [];
  let pendingPath: string | undefined;
  try {
    for (let i = 0; i < clips.length; i++) {
      if (job.cancelled) break;
      const clip = clips[i];
      const directory = path.join(outputDir, clip.category ?? safeName(clip.color));
      const key = JSON.stringify([videoPath, clip.id, clip.startTime, clip.endTime, quality]);
      const existing = exportedFiles.get(key);
      event.sender.send('export-progress', { current: i + 1, total: clips.length, status: 'processing' });
      if (clip.category && existing && fs.existsSync(existing)) {
        const moved = await moveExport(existing, directory);
        exportedFiles.set(key, moved);
        results.push(moved);
        continue;
      }
      const remote = /^https?:/i.test(videoPath);
      const extension = remote ? '.mp4' : path.extname(videoPath).toLowerCase();
      const outputExtension = ['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(extension) ? extension : '.mp4';
      const base = remote ? 'Twitch_VOD' : path.basename(videoPath, path.extname(videoPath));
      pendingPath = await reserveOutput(directory, `${base}_clip_${i + 1}`, outputExtension);
      const args = ['-nostdin', '-y', '-ss', String(clip.startTime), '-i', videoPath, '-t', String(clip.endTime - clip.startTime)];
      if (quality === 'source') args.push('-c', 'copy');
      else args.push('-vf', quality === 'fhd' ? 'scale=-2:1080' : 'scale=-2:720');
      args.push(pendingPath);
      await new Promise<void>((resolve, reject) => {
        if (job.cancelled) { reject(new Error('Exportación cancelada')); return; }
        const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
        ffmpegProcesses.set(exportId, proc);
        let diagnostics = '';
        proc.stderr.on('data', (data: Buffer) => { diagnostics = (diagnostics + data.toString()).slice(-2000); });
        proc.on('error', reject);
        proc.on('close', code => {
          ffmpegProcesses.delete(exportId);
          if (job.cancelled) reject(new Error('Exportación cancelada'));
          else if (code === 0) resolve();
          else reject(new Error(`FFmpeg (${code}): ${diagnostics}`));
        });
      });
      exportedFiles.set(key, pendingPath);
      results.push(pendingPath);
      pendingPath = undefined;
    }
    return { success: !job.cancelled, cancelled: job.cancelled, files: results };
  } catch (error) {
    return { success: false, cancelled: job.cancelled, files: results, error: error instanceof Error ? error.message : 'Error de exportación' };
  } finally {
    if (pendingPath) await fs.promises.unlink(pendingPath).catch(() => {});
    exportJobs.delete(exportId);
    ffmpegProcesses.delete(exportId);
  }
});

ipcMain.handle('cancel-export', async (_event: IpcMainInvokeEvent, exportId: string): Promise<{ success: boolean; error?: string }> => {
  const job = exportJobs.get(exportId);
  if (!job) return { success: false, error: 'No hay exportación en curso' };
  job.cancelled = true;
  ffmpegProcesses.get(exportId)?.kill('SIGTERM');
  return { success: true };
});
