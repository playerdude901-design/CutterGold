import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

interface ExportProgress {
  current: number;
  total: number;
  status: 'processing' | 'done' | 'error' | 'cancelled';
  files?: string[];
  error?: string;
}

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

interface ExportResult {
  success: boolean;
  files?: string[];
  error?: string;
  cancelled?: boolean;
}

contextBridge.exposeInMainWorld('api', {
  selectVideo: (): Promise<string | null> => ipcRenderer.invoke('select-video'),
  selectOutputDir: (): Promise<string | null> => ipcRenderer.invoke('select-output-dir'),
  getStreamUrl: (url: string): Promise<StreamUrlResult> => ipcRenderer.invoke('get-stream-url', url),
  exportClips: (data: {
    videoPath: string;
    outputDir: string;
    clips: Array<{
      id: string;
      startTime: number;
      endTime: number;
      color: string;
      colorValue: string;
    }>;
    quality: 'source' | 'hd' | 'fhd';
  }): Promise<ExportResult> => ipcRenderer.invoke('export-clips', data),
  cancelExport: (exportId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('cancel-export', exportId),
  onExportProgress: (callback: (progress: ExportProgress) => void): void => {
    ipcRenderer.on('export-progress', (_event: IpcRendererEvent, value: ExportProgress) => callback(value));
  }
});