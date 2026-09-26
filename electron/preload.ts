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

interface MediaAudioTrack {
  id: string;
  streamIndex: number;
  name: string;
  codec: string;
  sampleRate: number;
  channels: string;
  duration: number;
  previewSrc: string;
  peaks: number[];
  progress: number;
  status: 'processing' | 'ready' | 'error';
}

interface AudioAnalysisProgress {
  requestId: string;
  current: number;
  total: number;
  percentage: number;
  track?: MediaAudioTrack;
}

contextBridge.exposeInMainWorld('api', {
  analyzeAudioTracks: (videoPath: string, requestId?: string): Promise<MediaAudioTrack[]> => ipcRenderer.invoke('analyze-audio-tracks', videoPath, requestId),
  releaseAudioPreviews: (ids: string[]): Promise<void> => ipcRenderer.invoke('release-audio-previews', ids),
  onAudioAnalysisProgress: (callback: (progress: AudioAnalysisProgress) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, value: AudioAnalysisProgress) => callback(value);
    ipcRenderer.on('audio-analysis-progress', listener);
    return () => ipcRenderer.removeListener('audio-analysis-progress', listener);
  },
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
