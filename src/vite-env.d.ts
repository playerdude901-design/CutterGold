/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  api: {
    analyzeAudioTracks: (videoPath: string, requestId?: string) => Promise<Array<{
      id: string
      streamIndex: number
      name: string
      codec: string
      sampleRate: number
      channels: string
      duration: number
      previewSrc: string
      peaks: number[]
      progress: number
      status: 'processing' | 'ready' | 'error'
    }>>
    releaseAudioPreviews: (ids: string[]) => Promise<void>
    onAudioAnalysisProgress: (callback: (progress: { requestId: string; current: number; total: number; percentage: number; track?: {
      id: string; streamIndex: number; name: string; codec: string; sampleRate: number; channels: string; duration: number;
      previewSrc: string; peaks: number[]; progress: number; status: 'processing' | 'ready' | 'error'
    } }) => void) => (() => void)
    getClipScoreSettings: () => Promise<{ configured: boolean; model: string }>
    saveClipScoreSettings: (settings: { apiKey?: string; model: string }) => Promise<void>
    clipScoreSuggestion: (stats: { counts: Record<string, number>; duration: number }) => Promise<{ text?: string; error?: string }>
    selectVideo: () => Promise<string | null>
    selectOutputDir: () => Promise<string | null>
    getStreamUrl: (url: string) => Promise<{
      success: boolean
      url?: string
      formats?: Array<{
        format_id: string
        format_note: string
        height: number
        fps: number
        url: string
      }>
      error?: string
    }>
    exportClips: (data: {
      exportId?: string
      videoPath: string
      outputDir: string
      clips: Array<{
        id: string
        startTime: number
        endTime: number
        color: string
        category?: 'Excelente' | 'Bueno' | 'Dudoso' | 'Descartar'
        colorValue: string
      }>
      quality: 'source' | 'hd' | 'fhd'
    }) => Promise<{
      success: boolean
      files?: string[]
      error?: string
      cancelled?: boolean
    }>
    cancelExport: (exportId: string) => Promise<{ success: boolean; error?: string }>
    onExportProgress: (callback: (progress: {
      current: number
      total: number
      status: 'processing' | 'done' | 'error' | 'cancelled'
      files?: string[]
      error?: string
    }) => void) => (() => void)
  }
}
