import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import ytDlp from 'yt-dlp-exec';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const ffmpegProcesses = new Map<string, ChildProcessWithoutNullStreams>();

function createWindow(): void {
  const possibleIconPaths = [
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
    path.join(__dirname, '..', '..', 'node_modules', 'yt-dlp-exec', 'bin', execName),
    path.join(__dirname, '..', 'node_modules', 'yt-dlp-exec', 'bin', execName),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'yt-dlp-exec', 'bin', execName),
    path.join(process.resourcesPath, 'extraResources', execName),
    execName
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  return possiblePaths[0];
}

function getFfmpegPath(): string {
  if (typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  if (typeof ffmpegStatic === 'string') {
    const unpacked = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
  }

  const isWin = process.platform === 'win32';
  const execName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

  const possiblePaths = [
    path.join(__dirname, '..', '..', 'node_modules', 'ffmpeg-static', execName),
    path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', execName),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', execName),
    path.join(process.resourcesPath, 'extraResources', execName),
    execName
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return execName;
}

interface ClipData {
  id: string;
  startTime: number;
  endTime: number;
  color: string;
  colorValue: string;
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

ipcMain.handle('export-clips', async (event: IpcMainInvokeEvent, params: ExportClipsParams): Promise<ExportResult> => {
  const { videoPath, outputDir, clips, quality } = params;
  
  if (!videoPath || !outputDir || !clips || !Array.isArray(clips) || clips.length === 0) {
    return { success: false, error: 'Parámetros inválidos para exportación' };
  }
  
  if (!mainWindow) {
    return { success: false, error: 'Ventana principal no disponible' };
  }

  const exportId = Date.now().toString();
  let cancelled = false;
  
  const cancelHandler = (_e: IpcMainInvokeEvent, id: string) => {
    if (id === exportId) {
      cancelled = true;
      const proc = ffmpegProcesses.get(exportId);
      if (proc) proc.kill('SIGTERM');
    }
  };
  ipcMain.once('cancel-export', cancelHandler);

  try {
    const results: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      if (cancelled) {
        return { success: false, error: 'Exportación cancelada por el usuario', cancelled: true };
      }
      
      const clip = clips[i];
      const colorDir = path.join(outputDir, clip.color);
      
      if (!fs.existsSync(colorDir)) {
        fs.mkdirSync(colorDir, { recursive: true });
      }

      let ext = path.extname(videoPath);
      let baseName = path.basename(videoPath, ext);

      if (videoPath.startsWith('http') || ext.includes('.m3u8')) {
        ext = '.mp4';
        baseName = 'Twitch_VOD';
      }

      const outputPath = path.join(colorDir, `${baseName}_clip_${i + 1}${ext}`);

      event.sender.send('export-progress', { current: i + 1, total: clips.length, status: 'processing' });

      const start = clip.startTime;
      const duration = clip.endTime - clip.startTime;

      let ffmpegArgs: string[] = [
        '-y',
        '-ss', start.toString(),
        '-i', videoPath,
        '-t', duration.toString()
      ];

      if (quality === 'fhd') {
        ffmpegArgs.push('-vf', 'scale=-2:1080');
      } else if (quality === 'hd') {
        ffmpegArgs.push('-vf', 'scale=-2:720');
      } else {
        ffmpegArgs.push('-c', 'copy');
      }

      ffmpegArgs.push(outputPath);

      await new Promise<void>((res, rej) => {
        if (cancelled) {
          rej(new Error('Exportación cancelada'));
          return;
        }
        
        const resolvedFfmpegPath = getFfmpegPath();
        
        const ffmpeg = spawn(resolvedFfmpegPath, ffmpegArgs);
        ffmpegProcesses.set(exportId, ffmpeg);

        ffmpeg.on('close', (code: number | null) => {
          ffmpegProcesses.delete(exportId);
          if (cancelled) {
            rej(new Error('Exportación cancelada'));
            return;
          }
          if (code === 0) {
            results.push(outputPath);
            res();
          } else {
            rej(new Error(`FFmpeg exited with code ${code}`));
          }
        });
        
        ffmpeg.on('error', (err: Error) => {
          ffmpegProcesses.delete(exportId);
          rej(err);
        });
        
        ffmpeg.stderr.on('data', (data: Buffer) => {
          console.log(`FFmpeg: ${data}`);
        });
      });
    }
    return { success: true, files: results };
  } catch (err) {
    console.error(err);
    return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  } finally {
    ipcMain.off('cancel-export', cancelHandler);
    ffmpegProcesses.delete(exportId);
  }
});

// 4. Cancel export
ipcMain.handle('cancel-export', async (_event: IpcMainInvokeEvent, exportId: string): Promise<{ success: boolean; error?: string }> => {
  const proc = ffmpegProcesses.get(exportId);
  if (proc) {
    proc.kill('SIGTERM');
    return { success: true };
  }
  return { success: false, error: 'No hay exportación en curso' };
});