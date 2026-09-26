export interface AudioTrack {
  id: string;
  streamIndex: number;
  name: string;
  codec: string;
  sampleRate: number;
  channels: string;
  duration: number;
  previewSrc: string;
  peaks: Float32Array;
  progress: number;
  status: 'processing' | 'ready' | 'error';
  volume: number;
  muted: boolean;
  solo: boolean;
}
