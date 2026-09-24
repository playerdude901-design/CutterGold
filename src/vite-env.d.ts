/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  api: {
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
      videoPath: string
      outputDir: string
      clips: Array<{
        id: string
        startTime: number
        endTime: number
        color: string
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
    }) => void) => void
  }
}