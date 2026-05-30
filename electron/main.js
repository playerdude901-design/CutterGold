import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import ytDlp from 'yt-dlp-exec';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  const startUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  autoUpdater.autoDownload = false;
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
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
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

// 1. Select a video file
ipcMain.handle('select-video', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// 2. Select an output directory
ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// 2.5. Get Stream URL (Twitch/YouTube)
ipcMain.handle('get-stream-url', async (event, url) => {
  try {
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
    let binaryPath = path.join(__dirname, '..', 'node_modules', 'yt-dlp-exec', 'bin', binaryName);
    if (binaryPath.includes('app.asar')) {
      binaryPath = binaryPath.replace('app.asar', 'app.asar.unpacked');
    }

    const customYtDlp = ytDlp.create(binaryPath);
    const result = await customYtDlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
    });

    let formats = [];
    if (result.formats) {
      formats = result.formats
        // Filter out audio-only if possible, though Twitch usually has combined streams
        .filter(f => f.vcodec !== 'none' && f.url)
        .map(f => ({
          format_id: f.format_id,
          format_note: f.format_note || f.format_id,
          height: f.height || 0,
          fps: f.fps || 0,
          url: f.url
        }))
        // Sort descending by height and fps
        .sort((a, b) => {
          if (b.height !== a.height) return b.height - a.height;
          return b.fps - a.fps;
        });
    }

    return { success: true, url: result.url, formats };
  } catch (err) {
    console.error('yt-dlp error:', err);
    return { success: false, error: err.message };
  }
});

// 3. Export clips
ipcMain.handle('export-clips', async (event, { videoPath, outputDir, clips, quality }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const results = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const colorDir = path.join(outputDir, clip.color);
        
        // Create directory if it doesn't exist
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

        // Notify frontend of progress
        event.sender.send('export-progress', { current: i + 1, total: clips.length, status: 'processing' });

        // Duration to cut
        const start = clip.startTime;
        const duration = clip.endTime - clip.startTime;

        // Configure FFmpeg arguments based on requested quality
        let ffmpegArgs = [
          '-y', // Overwrite output files without asking
          '-ss', start.toString(),
          '-i', videoPath,
          '-t', duration.toString()
        ];

        if (quality === 'fhd') {
          ffmpegArgs.push('-vf', 'scale=-2:1080'); // Scale to 1080p, auto width
        } else if (quality === 'hd') {
          ffmpegArgs.push('-vf', 'scale=-2:720'); // Scale to 720p, auto width
        } else {
          // Source (original quality)
          ffmpegArgs.push('-c', 'copy');
        }

        ffmpegArgs.push(outputPath);

        // Run FFmpeg
        await new Promise((res, rej) => {
          let resolvedFfmpegPath = ffmpegStatic;
          if (resolvedFfmpegPath.includes('app.asar')) {
            resolvedFfmpegPath = resolvedFfmpegPath.replace('app.asar', 'app.asar.unpacked');
          }
          const ffmpeg = spawn(resolvedFfmpegPath, ffmpegArgs);

          ffmpeg.on('close', (code) => {
            if (code === 0) {
              results.push(outputPath);
              res();
            } else {
              rej(new Error(`FFmpeg exited with code ${code}`));
            }
          });
          
          ffmpeg.stderr.on('data', (data) => {
            console.log(`FFmpeg: ${data}`);
          });
        });
      }
      resolve({ success: true, files: results });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
});
