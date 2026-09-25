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
  getClipScoreSettings: () => ipcRenderer.invoke('clipscore-settings-get'),
  saveClipScoreSettings: (settings: { apiKey?: string; model: string }) => ipcRenderer.invoke('clipscore-settings-save', settings),
  clipScoreSuggestion: (stats: { counts: Record<string, number>; duration: number }) => ipcRenderer.invoke('clipscore-suggestion', stats),
  selectVideo: (): Promise<string | null> => ipcRenderer.invoke('select-video'),
  selectOutputDir: (): Promise<string | null> => ipcRenderer.invoke('select-output-dir'),
  getStreamUrl: (url: string): Promise<StreamUrlResult> => ipcRenderer.invoke('get-stream-url', url),
  exportClips: (data: {
    exportId?: string;
    videoPath: string;
    outputDir: string;
    clips: Array<{
      id: string;
      startTime: number;
      endTime: number;
      color: string;
      category?: 'Excelente' | 'Bueno' | 'Dudoso' | 'Descartar';
      colorValue: string;
    }>;
    quality: 'source' | 'hd' | 'fhd';
  }): Promise<ExportResult> => ipcRenderer.invoke('export-clips', data),
  cancelExport: (exportId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('cancel-export', exportId),
  onExportProgress: (callback: (progress: ExportProgress) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, value: ExportProgress) => callback(value);
    ipcRenderer.on('export-progress', listener);
    return () => ipcRenderer.removeListener('export-progress', listener);
  }
});