import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export interface MediaAudioTrack {
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

const activeProcesses = new Set<ReturnType<typeof spawn>>();
const generatedPreviews = new Set<string>();
const processesByRequest = new Map<string, Set<ReturnType<typeof spawn>>>();
const cancelledRequests = new Set<string>();

function registerProcess(requestId: string, process: ReturnType<typeof spawn>) {
  activeProcesses.add(process);
  const processes = processesByRequest.get(requestId) ?? new Set();
  processes.add(process);
  processesByRequest.set(requestId, processes);
  process.once('close', () => {
    activeProcesses.delete(process);
    processes.delete(process);
    if (!processes.size) processesByRequest.delete(requestId);
  });
}

interface DiscoveredStream {
  streamIndex: number;
  name: string;
  codec: string;
  sampleRate: number;
  channels: string;
  duration: number;
}

export function parseAudioStreams(output: string): DiscoveredStream[] {
  const discovered = new Map<number, DiscoveredStream>();
  const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : 0;
  for (const line of output.split(/\r?\n/)) {
    const streamMatch = line.match(/Stream #\d+:(\d+)/);
    const codecMatch = line.match(/\bAudio:\s*([^,\s]+)/);
    if (!streamMatch || !codecMatch) continue;
    const streamIndex = Number(streamMatch[1]);
    const language = line.match(/Stream #\d+:\d+(?:\[[^\]]+\])?\(([a-z]{2,3})\)\s*:/i)?.[1];
    const sampleRate = Number(line.match(/\b(\d{4,6}) Hz\b/)?.[1] ?? 0);
    const channels = line.match(/\b(mono|stereo|(?:\d+(?:\.\d+)? channels))\b/i)?.[1] ?? 'Canales detectados';
    discovered.set(streamIndex, {
      streamIndex,
      name: language ? `Audio ${language.toUpperCase()}` : `Audio ${discovered.size + 1}`,
      codec: codecMatch[1].toUpperCase(),
      sampleRate,
      channels,
      duration,
    });
  }
  return [...discovered.values()].slice(0, 8).map((stream, index) => ({ ...stream, name: `${String(index + 1).padStart(2, '0')} · ${stream.name}` }));
}

function discoverAudioStreams(input: string, requestId: string): Promise<DiscoveredStream[]> {
  return new Promise((resolve, reject) => {
    const process = spawn(input ? processPath() : '', ['-hide_banner', '-i', input], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    registerProcess(requestId, process);
    let stderr = '';
    process.stderr?.on('data', data => { stderr = (stderr + data.toString()).slice(-512_000); });
    process.once('error', error => reject(error));
    process.once('close', () => resolve(cancelledRequests.has(requestId) ? [] : parseAudioStreams(stderr)));
  });
}

let ffmpegPath = '';
function processPath(): string { return ffmpegPath; }
export function setMediaFfmpegPath(executable: string): void { ffmpegPath = executable; }

const previewDirectory = fs.mkdtempSync(path.join(tmpdir(), 'cuttergold-audio-'));

// Measure peaks before reducing to 100 ms bins. Resampling the signal to
// 100 Hz first would low-pass away voice/music and produce an almost flat line.
interface WaveformAccumulator {
  track: MediaAudioTrack;
  previewPath: string;
  remainder: Buffer<ArrayBufferLike>;
  maxSample: number;
  sampleCount: number;
  lastPublishedAt: number;
}

function consumeWaveform(state: WaveformAccumulator, chunk: Buffer) {
  const buffer = state.remainder.length ? Buffer.concat([state.remainder, chunk]) : chunk;
  const usableBytes = buffer.length - buffer.length % 2;
  for (let offset = 0; offset < usableBytes; offset += 2) {
    state.maxSample = Math.max(state.maxSample, Math.abs(buffer.readInt16LE(offset)) / 32768);
    // 48 kHz stereo: take the maximum across both channels without phase cancellation.
    if (++state.sampleCount === 9600) {
      state.track.peaks.push(state.maxSample);
      state.maxSample = 0;
      state.sampleCount = 0;
    }
  }
  state.remainder = Buffer.from(buffer.subarray(usableBytes));
}

export function cancelAudioAnalysis(requestId: string): void {
  cancelledRequests.add(requestId);
  for (const process of processesByRequest.get(requestId) ?? []) process.kill('SIGTERM');
}

export async function analyzeAudioTracks(
  input: string,
  requestId: string,
  onProgress: (current: number, total: number, percentage: number) => void = () => {},
  onTrack: (track: MediaAudioTrack, overallProgress: number, current: number, total: number) => void = () => {},
): Promise<MediaAudioTrack[]> {
  if (!path.isAbsolute(input) || !fs.existsSync(input) || !fs.statSync(input).isFile()) throw new Error('Selecciona un archivo local existente para analizar su audio.');
  const streams = await discoverAudioStreams(input, requestId);
  if (cancelledRequests.has(requestId)) { cancelledRequests.delete(requestId); return []; }
  if (!streams.length) return [];
  const totalDuration = streams.reduce((sum, stream) => sum + (stream.duration || 1), 0);
  let completedDuration = 0;
  const outputs = streams.map((stream, index) => {
    const id = randomUUID();
    const previewPath = path.join(previewDirectory, `${id}.m4a`);
    const track: MediaAudioTrack = { ...stream, id, previewSrc: '', peaks: [], progress: 0, status: 'processing' };
    const state: WaveformAccumulator = { track, previewPath, remainder: Buffer.alloc(0), maxSample: 0, sampleCount: 0, lastPublishedAt: 0 };
    return { stream, state, index, weight: stream.duration || 1 };
  });
  for (const { state, index } of outputs) {
    onTrack(state.track, completedDuration / totalDuration * 100, index + 1, streams.length);
    onProgress(index + 1, streams.length, completedDuration / totalDuration * 100);
  }
  try {
    const tracks: MediaAudioTrack[] = outputs.map(output => output.state.track);
    for (const output of outputs) {
      if (cancelledRequests.has(requestId)) throw new Error('Audio analysis cancelled.');
      const { state, index, weight, stream } = output;
      const args = ['-hide_banner', '-nostdin', '-y', '-i', input, '-progress', 'pipe:1', '-nostats',
        '-map', `0:${stream.streamIndex}`, '-vn', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', state.previewPath,
        '-map', `0:${stream.streamIndex}`, '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:3'];
      try { await new Promise<void>((resolve, reject) => {
        const process = spawn(ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
        registerProcess(requestId, process);
        process.stdio[3]?.on('data', (chunk: Buffer) => consumeWaveform(state, chunk));
        let stdout = '';
        let stderr = '';
        process.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
          const lines = stdout.split(/\r?\n/);
          stdout = lines.pop() ?? '';
          const clock = lines.find(line => line.startsWith('out_time_us=') || line.startsWith('out_time_ms='));
          if (clock) {
            const outputSeconds = Number(clock.split('=')[1]) / 1_000_000;
            const localProgress = stream.duration ? Math.max(0, Math.min(1, outputSeconds / stream.duration)) : 0;
            const overallProgress = Math.max(0, Math.min(99, Math.floor((completedDuration + weight * localProgress) / totalDuration * 100)));
            state.track.progress = Math.floor(localProgress * 100);
            onProgress(index + 1, streams.length, overallProgress);
            if (Date.now() - state.lastPublishedAt >= 800) {
              state.lastPublishedAt = Date.now();
              onTrack({ ...state.track, peaks: [...state.track.peaks] }, overallProgress, index + 1, streams.length);
            }
          }
        });
        process.stderr?.on('data', data => { stderr = (stderr + data.toString()).slice(-8000); });
        process.once('error', error => reject(error));
        process.once('close', code => {
          if (cancelledRequests.has(requestId)) reject(new Error('Audio analysis cancelled.'));
          else if (code === 0) resolve();
          else reject(new Error(stderr.trim().split(/\r?\n/).at(-1) || `FFmpeg terminó con código ${code}`));
        });
      }); } catch (error) {
        if (cancelledRequests.has(requestId)) throw error;
        state.track = { ...state.track, status: 'error', progress: 100 };
        tracks[index] = state.track;
        await fs.promises.unlink(state.previewPath).catch(() => {});
        completedDuration += weight;
        onTrack(state.track, completedDuration / totalDuration * 100, index + 1, streams.length);
        onProgress(index + 1, streams.length, Math.floor(completedDuration / totalDuration * 100));
        continue;
      }
      if (state.sampleCount) state.track.peaks.push(state.maxSample);
      generatedPreviews.add(state.previewPath);
      state.track = { ...state.track, status: 'ready', progress: 100, previewSrc: pathToFileURL(state.previewPath).href };
      tracks[index] = state.track;
      completedDuration += weight;
      onTrack({ ...state.track, peaks: [...state.track.peaks] }, completedDuration / totalDuration * 100, index + 1, streams.length);
      onProgress(index + 1, streams.length, Math.floor(completedDuration / totalDuration * 100));
    }
    cancelledRequests.delete(requestId);
    return tracks;
  } catch (error) {
    cancelledRequests.delete(requestId);
    for (const output of outputs) {
      if (output.state.track.status !== 'ready') {
        generatedPreviews.delete(output.state.previewPath);
        await fs.promises.unlink(output.state.previewPath).catch(() => {});
      }
    }
    throw error;
  }
}

export async function releaseAudioPreviews(ids: string[]): Promise<void> {
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}\.m4a$/i.test(id)) continue;
    const filepath = path.join(previewDirectory, id);
    if (!generatedPreviews.has(filepath)) continue;
    generatedPreviews.delete(filepath);
    await fs.promises.unlink(filepath).catch(() => {});
  }
}

export async function disposeAudioPreviews(): Promise<void> {
  for (const process of activeProcesses) process.kill('SIGTERM');
  activeProcesses.clear();
  await fs.promises.rm(previewDirectory, { recursive: true, force: true }).catch(() => {});
}
