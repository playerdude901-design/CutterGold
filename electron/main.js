import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';
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

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Actualización lista',
      message: 'Una nueva versión de CutterGold se ha descargado. ¿Deseas instalarla y reiniciar ahora?',
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

        const ext = path.extname(videoPath);
        const baseName = path.basename(videoPath, ext);
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
