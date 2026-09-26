import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Video, FolderOpen, Download, Play, Pause, Trash2, Plus, Link as LinkIcon, AudioLines, Maximize2, Minimize2 } from 'lucide-react';
import Hls from 'hls.js';
import './App.css';
import { ClipScore } from './clipscore/ClipScore';
import { Settings } from './clipscore/Settings';
import type { Clip, Reviews } from './clipscore/model';
import { AudioWaveform } from './AudioWaveform';
import type { AudioTrack } from './media-audio';

const COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Purple', value: '#a855f7' }
];

function App() {
  const [videoFile, setVideoFile] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportQuality, setExportQuality] = useState<'source' | 'hd' | 'fhd'>('source');
  const [exportProgress, setExportProgress] = useState<any>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [showTwitchInput, setShowTwitchInput] = useState<boolean>(false);
  const [twitchUrl, setTwitchUrl] = useState<string>('');
  const [streamFormats, setStreamFormats] = useState<any[]>([]);
  const [showFormatSelection, setShowFormatSelection] = useState<boolean>(false);
  const [showUpdateNotice, setShowUpdateNotice] = useState<boolean>(true);
  const [exportId, setExportId] = useState<string | null>(null);
  
  const [showClipScore, setShowClipScore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [reviews, setReviews] = useState<Reviews>({});
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [audioStatus, setAudioStatus] = useState('');
  const [audioProgress, setAudioProgress] = useState<{ current: number; total: number; percentage: number } | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  // Interactive States
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<any>(null);
  const [editingTime, setEditingTime] = useState<{ id: string | null; type: string | null; value: string }>({ id: null, type: null, value: '' });
  
  // Refs for stable drag handlers
  const dragInfoRef = useRef(dragInfo);
  dragInfoRef.current = dragInfo;
  
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  
  const durationRef = useRef(duration);
  durationRef.current = duration;
  
  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement | null>>({});
  const audioTracksRef = useRef(audioTracks);
  audioTracksRef.current = audioTracks;
  const currentTimeRef = useRef<number>(currentTime);
  currentTimeRef.current = currentTime;
  
  const activeClipIdRef = useRef<string | null>(activeClipId);
  activeClipIdRef.current = activeClipId;
  
  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;
  const audioRequestIdRef = useRef('');
  const wasPlayingBeforeScrubRef = useRef(false);
  
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const trackControlRowsRef = useRef<HTMLDivElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const releaseAudioTracks = () => {
    const tracks = audioTracksRef.current;
    for (const track of tracks) {
      const element = audioElementsRef.current[track.id];
      if (element) { element.pause(); element.removeAttribute('src'); element.load(); }
      delete audioElementsRef.current[track.id];
    }
    audioTracksRef.current = [];
    setAudioTracks([]);
    if (tracks.length && window.api) void window.api.releaseAudioPreviews(tracks.map(track => track.id));
  };

  const syncAudioTracks = (play: boolean, time = videoRef.current?.currentTime ?? 0) => {
    const hasSolo = audioTracksRef.current.some(track => track.solo);
    for (const track of audioTracksRef.current) {
      const audio = audioElementsRef.current[track.id];
      if (!audio) continue;
      audio.volume = Math.max(0, Math.min(1, track.volume));
      audio.muted = track.muted || (hasSolo && !track.solo);
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA && Math.abs(audio.currentTime - time) > 0.35) {
        audio.currentTime = Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time);
      }
      if (play) void audio.play().catch(() => setAudioStatus('Pulsa Reproducir para escuchar las pistas OBS.'));
      else audio.pause();
    }
  };

  const updateAudioTrack = (id: string, update: Partial<Pick<AudioTrack, 'muted' | 'solo' | 'volume'>>) => {
    setAudioTracks(previous => previous.map(track => track.id === id ? { ...track, ...update } : track));
  };

  useEffect(() => {
    if (!videoFile || !window.api || videoFile.startsWith('blob:') || /^https?:/i.test(videoFile)) {
      setAudioStatus(videoFile ? 'Pistas adicionales disponibles en archivos locales multicanal.' : '');
      return;
    }
    let stale = false;
    let generated: AudioTrack[] = [];
    const requestId = crypto.randomUUID();
    audioRequestIdRef.current = requestId;
    setAudioTracks([]);
    setAudioProgress(null);
    setAudioStatus('Analizando las pistas de audio de OBS…');
    void window.api.analyzeAudioTracks(videoFile, requestId).then(discovered => {
      generated = discovered.map(track => {
        const current = audioTracksRef.current.find(existing => existing.id === track.id);
        return { ...track, peaks: Float32Array.from(track.peaks), volume: current?.volume ?? 0.85, muted: current?.muted ?? false, solo: current?.solo ?? false };
      });
      if (stale) {
        void window.api.releaseAudioPreviews(generated.map(track => track.id));
        return;
      }
      audioTracksRef.current = generated;
      setAudioTracks(generated);
      setAudioProgress(null);
      setAudioStatus(generated.length ? `${generated.length} pistas de audio detectadas · ondas a 0.1 s` : 'El archivo no contiene pistas de audio separadas.');
    }).catch(error => {
      if (!stale) { setAudioTracks([]); setAudioStatus(`No se pudieron leer las pistas de audio: ${error instanceof Error ? error.message : 'archivo no compatible'}`); }
    });
    return () => {
      stale = true;
      if (generated.length) void window.api.releaseAudioPreviews(generated.map(track => track.id));
    };
  }, [videoFile]);

  useEffect(() => window.api?.onAudioAnalysisProgress(progress => {
    if (progress.requestId !== audioRequestIdRef.current) return;
    setAudioProgress(progress.current > 0 ? { current: progress.current, total: progress.total, percentage: progress.percentage } : null);
    if (progress.track) {
      const previous = audioTracksRef.current;
      const existing = previous.find(track => track.id === progress.track?.id);
      const updated: AudioTrack = { ...progress.track, peaks: Float32Array.from(progress.track.peaks), volume: existing?.volume ?? 0.85, muted: existing?.muted ?? false, solo: existing?.solo ?? false };
      const next = [...previous.filter(track => track.id !== updated.id), updated].sort((a, b) => a.streamIndex - b.streamIndex);
      audioTracksRef.current = next;
      setAudioTracks(next);
    }
    setAudioStatus(`Generando vista previa y ondas · ${Math.round(progress.percentage)}%`);
  }), []);

  useEffect(() => { syncAudioTracks(isPlaying, currentTime); }, [audioTracks, isPlaying]);

  useEffect(() => {
    if (window.api && window.api.onExportProgress) {
      return window.api.onExportProgress((progress) => {
        setExportProgress(progress);
      });
    }
  }, []);

  const handleSelectVideo = async () => {
    if (window.api) {
      const filePath = await window.api.selectVideo();
      if (filePath) {
        releaseAudioTracks();
        setVideoFile(filePath);
        setVideoSrc(`file://${filePath}`);
        setClips([]);
        setReviews({});
        setActiveClipId(null);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files ? target.files[0] : null;
        if (file) {
          const objectUrl = URL.createObjectURL(file);
          releaseAudioTracks();
          setVideoFile(objectUrl);
          setVideoSrc(objectUrl);
          setClips([]);
          setReviews({});
          setActiveClipId(null);
        }
      };
      input.click();
    }
  };

  const handleSelectOutputDir = async () => {
    if (window.api && window.api.selectOutputDir) {
      try {
        const dirPath = await window.api.selectOutputDir();
        if (dirPath) {
          setOutputDir(dirPath);
        }
      } catch (err) {
        console.error("Error al seleccionar carpeta:", err);
      }
    } else {
      console.error("window.api.selectOutputDir no disponible. Verifica que el preload script se cargó correctamente.");
      alert("Error: No se puede abrir el selector de carpetas. Reinicia la aplicación.");
    }
  };

  const applyStreamUrl = (url: string) => {
    releaseAudioTracks();
    setVideoFile(url);
    setVideoSrc(url);
    setClips([]);
    setReviews({});
    setActiveClipId(null);
  };

  const submitTwitchVOD = async (url: string) => {
    setShowTwitchInput(false);
    setTwitchUrl('');
    if (!url) return;
    if (!window.api || !window.api.getStreamUrl) {
      alert("La API para streams no está disponible.");
      return;
    }

    setIsLoadingStream(true);
    try {
      const res = await window.api.getStreamUrl(url);
      if (res.success) {
        if (res.formats && res.formats.length > 0) {
          // Eliminar posibles duplicados
          const uniqueFormats = res.formats.reduce((acc: any[], current: any) => {
            const exists = acc.find(item => item.format_id === current.format_id);
            return exists ? acc : acc.concat([current]);
          }, []);
          setStreamFormats(uniqueFormats);
          setShowFormatSelection(true);
        } else if (res.url) {
          // Fallback a la calidad por defecto
          applyStreamUrl(res.url);
        }
      } else {
        alert("Error al obtener stream: " + res.error);
      }
    } catch (err: any) {
      alert("Error de conexión: " + (err?.message || err));
    } finally {
      setIsLoadingStream(false);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (videoSrc.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(videoSrc);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoSrc;
      }
    } else {
      video.src = videoSrc;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Revoke object URLs to prevent memory leaks
      if (videoSrc && videoSrc.startsWith('blob:')) {
        URL.revokeObjectURL(videoSrc);
      }
    };
  }, [videoSrc]);

  const checkOverlap = (clipsArray: any[], newClip: any, excludeId: string | null = null) => {
    return clipsArray.some(clip => {
      if (excludeId && clip.id === excludeId) return false;
      return !(newClip.endTime <= clip.startTime || newClip.startTime >= clip.endTime);
    });
  };

  const addClip = () => {
    if (!Number.isFinite(duration) || duration - currentTime < 0.5) return;
    const start = currentTime;
    const end = Math.min(currentTime + 5, duration);
    const newClip = {
      id: uuidv4(),
      startTime: start,
      endTime: end,
      color: COLORS[0].name,
      colorValue: COLORS[0].value
    };
    
    if (checkOverlap(clips, newClip)) {
      alert('Este clip se solapa con otro clip existente. Ajusta los tiempos.');
      return;
    }
    
    setClips([...clips, newClip]);
    setActiveClipId(newClip.id);
  };

  const removeClip = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setClips(clips.filter(c => c.id !== id));
    if (activeClipId === id) setActiveClipId(null);
  };

  const updateActiveClipColor = (colorObj: { name: string; value: string }) => {
    if (!activeClipId) return;
    setClips(clips.map(c => c.id === activeClipId ? { ...c, color: colorObj.name, colorValue: colorObj.value } : c));
  };

  const parseTime = (timeStr: string): number => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    let secs = 0;
    if (parts.length === 3) {
      secs += parseInt(parts[0] || '0') * 3600;
      secs += parseInt(parts[1] || '0') * 60;
      secs += parseFloat(parts[2] || '0');
    } else if (parts.length === 2) {
      secs += parseInt(parts[0] || '0') * 60;
      secs += parseFloat(parts[1] || '0');
    } else if (parts.length === 1) {
      secs += parseFloat(parts[0] || '0');
    }
    return isNaN(secs) ? 0 : secs;
  };

  const handleTimeEdit = (clipId: string, type: 'start' | 'end', valueStr: string) => {
    const newTime = parseTime(valueStr);
    const dur = durationRef.current;
    if (newTime >= 0 && newTime <= dur) {
      setClips(prevClips => {
        const clip = prevClips.find(c => c.id === clipId);
        if (!clip) return prevClips;
        
        if (type === 'start') {
          const newStart = Math.min(newTime, clip.endTime - 0.5);
          const newClip = { ...clip, startTime: newStart };
          if (checkOverlap(prevClips, newClip, clipId)) {
            return prevClips; // Reject if overlap
          }
          if (videoRef.current) videoRef.current.currentTime = newStart;
          return prevClips.map(c => c.id === clipId ? newClip : c);
        } else {
          const newEnd = Math.max(newTime, clip.startTime + 0.5);
          const newClip = { ...clip, endTime: newEnd };
          if (checkOverlap(prevClips, newClip, clipId)) {
            return prevClips; // Reject if overlap
          }
          if (videoRef.current) videoRef.current.currentTime = newEnd;
          return prevClips.map(c => c.id === clipId ? newClip : c);
        }
      });
    }
  };

  const handleExport = async () => {
    if (!window.api || !videoFile || !outputDir || clips.length === 0) return;
    const id = Date.now().toString();
    setExportId(id);
    setExporting(true);
    setExportProgress({ current: 0, total: clips.length, status: 'processing' });
    try {
      const result = await window.api.exportClips({
        videoPath: videoFile,
        outputDir: outputDir,
        clips: clips,
        exportId: id,
        quality: exportQuality
      });
      
      if (result.cancelled) {
        setExportProgress({ status: 'cancelled' });
      } else if (result.success) {
        setExportProgress({ status: 'done', files: result.files });
      } else {
        setExportProgress({ status: 'error', error: result.error });
      }
    } catch (error: any) {
      console.error(error);
      setExportProgress({ status: 'error', error: error?.message || 'Error desconocido' });
    }
  };
  
  const handleCancelExport = async () => {
    if (window.api && exportId) {
      await window.api.cancelExport(exportId);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlayingRef.current) {
        syncAudioTracks(false);
        videoRef.current.pause();
      } else {
        syncAudioTracks(true);
        void videoRef.current.play().catch(() => setAudioStatus('No se pudo reproducir este archivo.'));
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !dragInfoRef.current) {
      const newTime = videoRef.current.currentTime;
      setCurrentTime(newTime);
      syncAudioTracks(isPlayingRef.current, newTime);
      
      // Auto-scroll timeline to keep playhead in view when playing
      if (isPlayingRef.current && timelineScrollRef.current) {
        const playheadX = newTime * zoomLevelRef.current;
        const scrollContainer = timelineScrollRef.current;
        const scrollLeft = scrollContainer.scrollLeft;
        const clientWidth = scrollContainer.clientWidth;
        
        // If playhead moves beyond 80% of view, scroll right
        if (playheadX > scrollLeft + clientWidth * 0.8) {
          scrollContainer.scrollLeft = playheadX - clientWidth * 0.2;
        } else if (playheadX < scrollLeft) {
          scrollContainer.scrollLeft = Math.max(0, playheadX - clientWidth * 0.2);
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const vidDuration = videoRef.current.duration;
      setDuration(Number.isFinite(vidDuration) ? vidDuration : 0);
      
      // Auto-fit timeline to screen width initially
      if (timelineScrollRef.current && Number.isFinite(vidDuration) && vidDuration > 0) {
        const containerWidth = timelineScrollRef.current.clientWidth;
        // Calculate pixels per second needed to fit the whole duration exactly into the container
        let initialZoom = containerWidth / vidDuration;
        // Clamp to sensible defaults just in case
        initialZoom = Math.max(0.0001, Math.min(initialZoom, 1000));
        setZoomLevel(initialZoom);
      }
    }
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (dragInfoRef.current) return; 
    const target = e.target as HTMLElement;
    if (target.closest('.clip-marker') || target.closest('.playhead-handle')) return;
    
    const dur = durationRef.current;
    if (!dur || !videoRef.current || !timelineTrackRef.current) return;
    const rect = timelineTrackRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / zoomLevelRef.current;
    const newTime = Math.max(0, Math.min(pos, dur));
    videoRef.current.currentTime = newTime;
    syncAudioTracks(isPlayingRef.current, newTime);
    setCurrentTime(newTime);
    setActiveClipId(null);
  };

  const jumpToClip = (clip: any) => {
    setActiveClipId(clip.id);
    if (videoRef.current) {
      videoRef.current.currentTime = clip.startTime;
      syncAudioTracks(isPlayingRef.current, clip.startTime);
      setCurrentTime(clip.startTime);
    }
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = Math.max(0, (clip.startTime * zoomLevelRef.current) - (timelineScrollRef.current.clientWidth / 2));
    }
  };

  // --- ZOOM & PAN (WHEEL LOGIC) ---
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const dur = durationRef.current;
    if (!dur || !timelineScrollRef.current) return;

    if (e.altKey) {
      // Zoom
      e.preventDefault(); // Prevent browser zoom
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      const zoomMultiplier = 1 + zoomDelta;
      let newZoom = zoomLevelRef.current * zoomMultiplier;
      
      // Min/Max Zoom clamping
      const MAX_CANVAS_WIDTH = 30000;
      const absoluteMaxZoom = MAX_CANVAS_WIDTH / dur;
      
      const minZoom = timelineScrollRef.current.clientWidth / dur;
      newZoom = Math.max(minZoom, Math.min(newZoom, Math.min(500, absoluteMaxZoom)));

      // Keep cursor position stable relative to time
      const scrollContainer = timelineScrollRef.current;
      const containerRect = scrollContainer.getBoundingClientRect();
      const cursorX = e.clientX - containerRect.left;
      
      const timeAtCursor = (scrollContainer.scrollLeft + cursorX) / zoomLevelRef.current;
      const newScrollLeft = (timeAtCursor * newZoom) - cursorX;

      setZoomLevel(newZoom);
      
      requestAnimationFrame(() => {
        if (timelineScrollRef.current) {
           timelineScrollRef.current.scrollLeft = newScrollLeft;
        }
      });
    } else if (e.ctrlKey) {
      // Pan Left/Right (Horizontal Scroll)
      e.preventDefault();
      const panSpeed = 1.5;
      timelineScrollRef.current.scrollLeft += e.deltaY * panSpeed;
    }
  };

  // --- DRAG LOGIC ---
  const handleClipMouseDown = (e: React.MouseEvent, id: string, type: 'move' | 'start' | 'end') => {
    e.stopPropagation();
    setActiveClipId(id);
    const clip = clipsRef.current.find(c => c.id === id);
    if (!clip) return;
    
    setDragInfo({
      id,
      type, // 'move', 'start', 'end'
      startX: e.clientX,
      initialStart: clip.startTime,
      initialEnd: clip.endTime
    });
  };

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    wasPlayingBeforeScrubRef.current = isPlayingRef.current;
    setDragInfo({
      id: 'playhead',
      type: 'playhead',
      startX: e.clientX,
      initialStart: currentTimeRef.current
    });
    if (!isPlayingRef.current) {
      syncAudioTracks(true, currentTimeRef.current);
      void videoRef.current?.play().catch(() => {});
    }
  };

  // Smooth 60fps Playhead Sync during Video Playback
  useEffect(() => {
    let animFrameId: number;
    const syncPlayhead = () => {
      if (videoRef.current && isPlaying && !dragInfoRef.current) {
        const newTime = videoRef.current.currentTime;
        setCurrentTime(newTime);
        
        if (timelineScrollRef.current) {
          const playheadX = newTime * zoomLevelRef.current;
          const scrollContainer = timelineScrollRef.current;
          const scrollLeft = scrollContainer.scrollLeft;
          const clientWidth = scrollContainer.clientWidth;
          
          if (playheadX > scrollLeft + clientWidth * 0.8) {
            scrollContainer.scrollLeft = playheadX - clientWidth * 0.2;
          } else if (playheadX < scrollLeft) {
            scrollContainer.scrollLeft = Math.max(0, playheadX - clientWidth * 0.2);
          }
        }
        animFrameId = requestAnimationFrame(syncPlayhead);
      }
    };

    if (isPlaying) {
      animFrameId = requestAnimationFrame(syncPlayhead);
    }
    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [isPlaying, audioTracks]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const dragInfo = dragInfoRef.current;
    if (!dragInfo || !durationRef.current) return;
    
    if (dragInfo.type === 'playhead') {
      if (timelineTrackRef.current) {
        const rect = timelineTrackRef.current.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / zoomLevelRef.current;
        const newTime = Math.max(0, Math.min(pos, durationRef.current));
        if (videoRef.current) {
          videoRef.current.currentTime = newTime;
        }
        syncAudioTracks(true, newTime);
        if (videoRef.current?.paused) void videoRef.current.play().catch(() => {});
        setCurrentTime(newTime);
      }
      return;
    }

    const deltaX = e.clientX - dragInfo.startX;
    const deltaSeconds = deltaX / zoomLevelRef.current;

    setClips(prevClips => {
      const clip = prevClips.find(c => c.id === dragInfo.id);
      if (!clip) return prevClips;
      
      let newStart = clip.startTime;
      let newEnd = clip.endTime;
      const MIN_DURATION = 0.5;
      
      if (dragInfo.type === 'move') {
        const clipDuration = dragInfo.initialEnd - dragInfo.initialStart;
        newStart = Math.max(0, Math.min(dragInfo.initialStart + deltaSeconds, durationRef.current - clipDuration));
        newEnd = newStart + clipDuration;
      } else if (dragInfo.type === 'start') {
        newStart = Math.max(0, Math.min(dragInfo.initialStart + deltaSeconds, dragInfo.initialEnd - MIN_DURATION));
      } else if (dragInfo.type === 'end') {
        newEnd = Math.max(dragInfo.initialStart + MIN_DURATION, Math.min(dragInfo.initialEnd + deltaSeconds, durationRef.current));
      }

      // Check for overlaps
      const newClip = { ...clip, startTime: newStart, endTime: newEnd };
      if (checkOverlap(prevClips, newClip, dragInfo.id)) {
        return prevClips; // Reject the change if it causes overlap
      }

      if (videoRef.current) {
        if (dragInfo.type === 'start' || dragInfo.type === 'move') {
          videoRef.current.currentTime = newStart;
          syncAudioTracks(isPlayingRef.current, newStart);
          setCurrentTime(newStart);
        } else if (dragInfo.type === 'end') {
          videoRef.current.currentTime = newEnd;
          syncAudioTracks(isPlayingRef.current, newEnd);
          setCurrentTime(newEnd);
        }
      }

      return prevClips.map(c => c.id === dragInfo.id ? newClip : c);
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragInfoRef.current?.type === 'playhead' && !wasPlayingBeforeScrubRef.current) {
      videoRef.current?.pause();
      syncAudioTracks(false);
    }
    if (dragInfoRef.current) {
      setDragInfo(null);
    }
    wasPlayingBeforeScrubRef.current = false;
  }, []);

  useEffect(() => {
    if (dragInfo) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragInfo, handleMouseMove, handleMouseUp]);

  // Block native wheel on the container to intercept zoom/pan safely
  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const preventDefaultScroll = (e: WheelEvent) => {
      if (e.altKey || e.ctrlKey) e.preventDefault();
    };
    el.addEventListener('wheel', preventDefaultScroll, { passive: false });
    return () => el.removeEventListener('wheel', preventDefaultScroll);
  }, []);

  // --- CANVAS TIMELINE RULER ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;
    const rulerDuration = Math.max(duration, ...audioTracks.map(track => track.duration));
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = rulerDuration * zoomLevel;
    const height = 40; // canvas height

    // Adjust canvas resolution for retina displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // We want adaptive steps based on zoomLevel (pixels per second)
    let majorStep = 60; // seconds per major tick (with text)
    let minorStep = 10; // seconds per minor tick

    if (zoomLevel > 1000) { majorStep = 0.1; minorStep = 0.02; }
    else if (zoomLevel > 500) { majorStep = 0.5; minorStep = 0.1; }
    else if (zoomLevel > 100) { majorStep = 1; minorStep = 0.2; }
    else if (zoomLevel > 50) { majorStep = 5; minorStep = 1; }
    else if (zoomLevel > 20) { majorStep = 10; minorStep = 2; }
    else if (zoomLevel > 5) { majorStep = 30; minorStep = 5; }
    else if (zoomLevel > 1) { majorStep = 60; minorStep = 10; }
    else if (zoomLevel > 0.1) { majorStep = 300; minorStep = 60; }
    else { majorStep = 1800; minorStep = 300; }

    const showMs = majorStep < 1;

    for (let t = 0; t <= rulerDuration; t += minorStep) {
      const x = t * zoomLevel;
      
      // Floating point math safe modulo
      const mod = t % majorStep;
      const isMajor = mod < minorStep / 2 || (majorStep - mod) < minorStep / 2;

      let lineH = isMajor ? 15 : 5;

      ctx.fillRect(x - 0.5, height - lineH, 1, lineH);

      // Draw text for major ticks or first/last
      if (isMajor || t === 0 || t === Math.floor(rulerDuration)) {
        ctx.fillText(formatTimeCanvas(t, showMs), x, 2);
      }
    }
  }, [duration, zoomLevel, audioTracks.length, audioTracks.map(track => track.duration).join(',')]);

  const formatTime = (timeInSeconds: number, showMs = false) => {
    const hrs = Math.floor(timeInSeconds / 3600);
    const min = Math.floor((timeInSeconds % 3600) / 60);
    const sec = Math.floor(timeInSeconds % 60);
    const ms = Math.floor((timeInSeconds % 1) * 1000); 
    
    let str = `${hrs.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    if (showMs) {
      str += `.${ms.toString().padStart(3, '0')}`;
    }
    return str;
  };

  const formatTimeCanvas = (timeInSeconds: number, showMs = true) => {
    const hrs = Math.floor(timeInSeconds / 3600);
    const min = Math.floor((timeInSeconds % 3600) / 60);
    const sec = Math.floor(timeInSeconds % 60);
    const ms = Math.floor((timeInSeconds % 1) * 1000); 
    
    let str = `${hrs.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    if (showMs) {
      str += `:${ms.toString().padStart(3, '0')}`;
    }
    return str;
  };

  const activeClip = clips.find(c => c.id === activeClipId);
  const timelineDuration = Math.max(duration, ...audioTracks.map(track => track.duration));
  const trackWidth = timelineDuration * zoomLevel;
  const laneHeight = 76;
  const videoLaneHeight = 56;
  const rulerHeight = 40;
  const timelineTrackHeight = rulerHeight + videoLaneHeight + audioTracks.length * laneHeight + 8;
  const hasSoloTrack = audioTracks.some(track => track.solo);

  const clipsByColor = COLORS.map(c => ({
    ...c,
    items: clips.filter(clip => clip.color === c.name)
  })).filter(c => c.items.length > 0);

  return (
    <div className="app-container">
      {showClipScore && videoSrc && videoFile && clips.length > 0 && <ClipScore source={videoSrc} videoPath={videoFile} clips={clips} reviews={reviews} onReviews={setReviews} quality={exportQuality} onClose={() => setShowClipScore(false)} />}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <header className="header glass-panel">
        <h1 className="app-title">
          <span className="text-grey">Cutter</span>
          <span className="text-gold-shine">Gold</span>
          <span className="brand-badge">v0.1.0 PRO</span>
        </h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>Settings</button>
          <button className="btn" disabled={!clips.length || exporting || !videoSrc} onClick={() => { videoRef.current?.pause(); setShowClipScore(true); }}>Revisar clips</button>
          <button className="btn btn-secondary" onClick={() => setShowTwitchInput(true)} disabled={isLoadingStream}>
            <LinkIcon size={16} /> {isLoadingStream ? 'Cargando...' : 'Añadir Twitch VOD'}
          </button>
          <button className="btn" onClick={handleSelectVideo} disabled={isLoadingStream}>
            <Video size={16} /> Seleccionar Video
          </button>
        </div>
      </header>

      <main className={`main-content ${previewExpanded ? 'preview-expanded' : ''}`}>
        <div className="editor-top">
          <section className="video-section">
            <div className="video-container glass-panel">
              {videoSrc ? <video
                ref={videoRef}
                className="video-element"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => { setIsPlaying(true); syncAudioTracks(true); }}
                onPause={() => { setIsPlaying(false); syncAudioTracks(false); }}
                onSeeking={() => syncAudioTracks(isPlayingRef.current)}
                muted={audioTracks.some(track => track.status === 'ready')}
                onClick={togglePlay}
              /> : <div className="placeholder-video">
                <div className="placeholder-icon-wrap"><Video size={36} /></div>
                <div><h3>Sin video seleccionado</h3><p>Importa una grabación OBS local para detectar sus pistas de audio, o carga un VOD.</p></div>
              </div>}
              <button className="viewer-expand-btn" onClick={() => setPreviewExpanded(value => !value)} aria-label={previewExpanded ? 'Restaurar espacio de edición' : 'Ampliar vista previa'} aria-pressed={previewExpanded} title={previewExpanded ? 'Restaurar editor' : 'Ampliar vista previa'}>
                {previewExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            </div>
          </section>
          <aside className="sidebar glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Clips ({clips.length})</h2>
              <button className="btn" onClick={addClip} disabled={!videoSrc}><Plus size={18} /> Add Clip</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {activeClip && <div className="active-clip-editor" style={{ border: '1px solid var(--accent-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ color: 'var(--accent-primary)', margin: 0 }}>Editar Selección</h3>
                  <button onClick={() => setActiveClipId(null)} className="track-dismiss" aria-label="Cerrar edición">×</button>
                </div>
                <div className="clip-times" style={{ margin: '15px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(['start', 'end'] as const).map(type => <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <strong style={{ width: '40px' }}>{type === 'start' ? 'In:' : 'Out:'}</strong>
                    <input type="text"
                      value={editingTime.id === activeClip.id && editingTime.type === type ? editingTime.value : formatTime(type === 'start' ? activeClip.startTime : activeClip.endTime, true)}
                      onChange={e => setEditingTime({ id: activeClip.id, type, value: e.target.value })}
                      onFocus={e => setEditingTime({ id: activeClip.id, type, value: e.currentTarget.value })}
                      onBlur={e => { handleTimeEdit(activeClip.id, type, e.target.value); setEditingTime({ id: null, type: null, value: '' }); }}
                      onKeyDown={e => { if (e.key === 'Enter') { handleTimeEdit(activeClip.id, type, e.currentTarget.value); e.currentTarget.blur(); } }}
                      style={{ flex: 1, padding: '6px', background: 'rgba(0,0,0,.35)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '5px', fontFamily: 'monospace' }}
                    />
                  </label>)}
                </div>
                <p style={{ marginBottom: '8px' }}>Color de clip</p>
                <div className="color-picker" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  {COLORS.map(color => <button key={color.name} className={`color-swatch ${activeClip.color === color.name ? 'active' : ''}`} style={{ backgroundColor: color.value, width: '26px', height: '26px' }} onClick={() => updateActiveClipColor(color)} title={color.name} aria-label={`Color ${color.name}`} />)}
                </div>
                <button className="btn" style={{ width: '100%', backgroundColor: 'var(--danger)', color: 'white' }} onClick={e => removeClip(activeClip.id, e)}><Trash2 size={16} /> Eliminar Clip</button>
              </div>}
              <div className="clips-filter-list">
                <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>Resumen de Cortes</h3>
                {clipsByColor.length === 0 ? <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '20px', fontSize: '0.9rem' }}>No hay clips creados.</div> :
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {clipsByColor.map(category => <div key={category.name} style={{ background: 'rgba(0,0,0,.2)', padding: '10px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <span className="clip-summary-dot" style={{ backgroundColor: category.value }} /><strong style={{ fontSize: '0.9rem' }}>{category.name}</strong><span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{category.items.length} clips</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {category.items.map((clip, index) => <button key={clip.id} onClick={() => jumpToClip(clip)} className={`clip-nav-btn ${activeClipId === clip.id ? 'active' : ''}`} style={{ borderLeft: `3px solid ${clip.colorValue}` }}>Clip {index + 1}</button>)}
                      </div>
                    </div>)}
                  </div>}
              </div>
            </div>
            <div className="sidebar-export">
              <button className="btn btn-secondary" onClick={handleSelectOutputDir} style={{ width: '100%', padding: '10px', justifyContent: 'space-between', fontSize: '.84rem' }}>
                <span className="output-directory"><FolderOpen size={18} /><span>{outputDir || 'Seleccionar Carpeta Destino'}</span></span>{outputDir && <span style={{ color: 'var(--success)' }}>✓</span>}
              </button>
              <div><p style={{ margin: '8px 0', fontSize: '.82rem', color: 'var(--gold-light)' }}><strong>Calidad</strong></p>
                <div className="quality-options">{([['fhd', '1080p'], ['hd', '720p'], ['source', 'Original']] as const).map(([quality, label]) => <label key={quality}><input type="radio" name="quality" value={quality} checked={exportQuality === quality} onChange={() => setExportQuality(quality)} /> {label}</label>)}</div>
              </div>
              <button className="btn btn-gold-glow" style={{ width: '100%', padding: '12px' }} onClick={handleExport} disabled={!videoFile || !outputDir || !clips.length || exporting}>{exporting ? 'Exportando…' : <><Download size={18} /> Exportar {clips.length} {clips.length === 1 ? 'clip' : 'clips'}</>}</button>
            </div>
          </aside>
        </div>

        <section className="timeline-container glass-panel" aria-label="Timeline multipista">
          <div className="multitrack-toolbar">
            <div className="sequence-heading"><span className="sequence-icon"><AudioLines size={17} /></span><div><strong>SECUENCIA</strong><span>{videoFile?.split(/[\\/]/).pop() ?? 'Nueva secuencia OBS'}</span></div></div>
            <div className="timeline-transport">
              <code>{formatTime(currentTime, true)}</code>
              <button className="btn transport-button" onClick={togglePlay} disabled={!videoSrc} aria-label={isPlaying ? 'Pausar' : 'Reproducir'}>{isPlaying ? <Pause size={15} /> : <Play size={15} />}</button>
              <code>{formatTime(duration, true)}</code>
            </div>
            <span className={`audio-analysis-status ${audioTracks.length ? 'has-audio' : ''}`} title={audioStatus}>
              {audioProgress ? `Pista ${audioProgress.current}/${audioProgress.total} · ${Math.round(audioProgress.percentage)}%` : audioStatus || 'Importa una grabación local multicanal'}
            </span>
          </div>
          {audioProgress && <div className="audio-analysis-progress" role="progressbar" aria-label="Procesamiento de pistas y formas de onda" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(audioProgress.percentage)}>
            <div className="audio-analysis-progress-fill" style={{ width: `${Math.max(0, Math.min(100, audioProgress.percentage))}%` }} />
            <span>Preparando pistas de audio · {Math.round(audioProgress.percentage)}%</span>
          </div>}
          <div className="multitrack-layout">
            <div className="track-control-column">
              <div className="track-ruler-label"><span>PISTAS · M MUTE · S SOLO</span></div>
              <div className="track-control-rows" ref={trackControlRowsRef}>
                <div className="track-header video-track-header"><span className="track-index video-index">V1</span><span>Video</span></div>
                {audioTracks.map((track, index) => <div className="track-header audio-track-header" key={track.id}>
                  <div className="track-title"><span className="track-index audio-index">A{index + 1}</span><span className="track-name" title={track.name}>{track.name}</span></div>
                  <div className="track-mix-controls">
                    <button className={`mix-toggle ${track.muted ? 'mix-active' : ''}`} aria-label={`${track.muted ? 'Activar' : 'Silenciar'} ${track.name}`} aria-pressed={track.muted} onClick={() => updateAudioTrack(track.id, { muted: !track.muted })}>M</button>
                    <button className={`mix-toggle ${track.solo ? 'solo-active' : ''}`} aria-label={`${track.solo ? 'Desactivar solo de' : 'Solo'} ${track.name}`} aria-pressed={track.solo} onClick={() => updateAudioTrack(track.id, { solo: !track.solo })}>S</button>
                    <input className="track-volume" aria-label={`Volumen ${track.name}`} type="range" min="0" max="1" step="0.01" value={track.volume} onChange={e => updateAudioTrack(track.id, { volume: Number(e.target.value) })} />
                  </div>
                </div>)}
              </div>
            </div>
            <div className="timeline-scroll-area timeline-multitrack-scroll" ref={timelineScrollRef} onScroll={e => { if (trackControlRowsRef.current) trackControlRowsRef.current.scrollTop = e.currentTarget.scrollTop; }} onWheel={handleWheel}>
              <div className="timeline-track multitrack-track" ref={timelineTrackRef} onClick={handleTimelineClick} style={{ width: duration ? `${trackWidth}px` : '100%', minWidth: '100%', height: `${timelineTrackHeight}px` }}>
                {duration > 0 && <canvas ref={canvasRef} className="timeline-canvas" />}
                <div className="multitrack-video-lane" style={{ top: rulerHeight, height: videoLaneHeight }}>
                  <span className="video-placeholder-label">{videoSrc ? 'VISTA DE CLIP' : 'ARRASTRA O ABRE UN VIDEO'}</span>
                  {clips.map(clip => <div key={clip.id} className={`clip-marker ${activeClipId === clip.id ? 'active' : ''}`} style={{ left: `${clip.startTime * zoomLevel}px`, width: `${(clip.endTime - clip.startTime) * zoomLevel}px`, backgroundColor: clip.colorValue }} onMouseDown={e => handleClipMouseDown(e, clip.id, 'move')}>
                    <div className="video-clip-label">VIDEO · {formatTime(clip.startTime, true)} – {formatTime(clip.endTime, true)}</div>
                    <div className="clip-handle clip-handle-left" onMouseDown={e => handleClipMouseDown(e, clip.id, 'start')} />
                    <div className="clip-handle clip-handle-right" onMouseDown={e => handleClipMouseDown(e, clip.id, 'end')} />
                  </div>)}
                </div>
                {audioTracks.map((track, index) => <div className={`audio-track-lane track-color-${index % 4}`} key={track.id} style={{ top: `${rulerHeight + videoLaneHeight + index * laneHeight}px`, height: laneHeight }}>
                  <div className="audio-clip-block" style={{ width: `${track.duration * zoomLevel}px`, minWidth: `${track.duration ? Math.min(60, track.duration * zoomLevel) : 0}px` }} onMouseDown={e => e.stopPropagation()}>
                    <AudioWaveform peaks={track.peaks} duration={track.duration} />
                    <span className="audio-clip-label">{track.name} · {track.codec} · {track.channels}</span>
                  </div>
                  {clips.map(clip => <div key={clip.id} className="audio-clip-selection" aria-hidden="true" style={{ left: `${clip.startTime * zoomLevel}px`, width: `${(clip.endTime - clip.startTime) * zoomLevel}px`, backgroundColor: clip.colorValue, opacity: 0.12 }} />)}
                {track.status === 'ready' && track.previewSrc && <audio ref={element => { audioElementsRef.current[track.id] = element; }} src={track.previewSrc} preload="auto" muted={track.muted || (hasSoloTrack && !track.solo)} onLoadedMetadata={() => syncAudioTracks(isPlayingRef.current, currentTimeRef.current)} />}
                </div>)}
                <div className="playhead" style={{ left: `${currentTime * zoomLevel}px`, height: `${timelineTrackHeight}px` }}><div className="playhead-handle" onMouseDown={handlePlayheadMouseDown} /></div>
              </div>
            </div>
          </div>
        </section>
      </main>
      {/* Export Progress Modal */}
      {exporting && exportProgress && (
        <div className="modal-overlay">
          <div className="modal-content">
            {exportProgress.status === 'processing' && (
              <>
                <div className="modal-spinner"></div>
                <h2 style={{ color: 'var(--accent-primary)', marginBottom: '10px' }}>Exportando Clips...</h2>
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                  ></div>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                  Procesando clip <strong>{exportProgress.current}</strong> de <strong>{exportProgress.total}</strong>
                </p>
                <p style={{ marginTop: '15px', fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                  Por favor espera, no cierres la aplicación.
                </p>
                <button 
                  className="btn btn-secondary" 
                  style={{ marginTop: '20px', width: '150px' }}
                  onClick={handleCancelExport}
                >
                  Cancelar
                </button>
              </>
            )}

            {exportProgress.status === 'done' && (
              <>
                <div style={{ fontSize: '3rem', color: 'var(--success)', marginBottom: '15px' }}>✓</div>
                <h2 style={{ color: 'var(--success)', marginBottom: '10px' }}>¡Exportación Exitosa!</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>Todos tus clips han sido guardados en el directorio seleccionado.</p>
                <button 
                  className="btn" 
                  style={{ margin: '0 auto', width: '150px' }}
                  onClick={() => {
                    setExportProgress(null);
                    setExporting(false);
                    setExportId(null);
                  }}
                >
                  Aceptar
                </button>
              </>
            )}

            {exportProgress.status === 'error' && (
              <>
                <div style={{ fontSize: '3rem', color: 'var(--danger)', marginBottom: '15px' }}>✗</div>
                <h2 style={{ color: 'var(--danger)', marginBottom: '10px' }}>Error en la exportación</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  {exportProgress.error ? `Error: ${exportProgress.error}` : 'Ocurrió un error al procesar los videos.'}
                </p>
                <button 
                  className="btn btn-secondary" 
                  style={{ margin: '0 auto', width: '150px' }}
                  onClick={() => {
                    setExportProgress(null);
                    setExporting(false);
                    setExportId(null);
                  }}
                >
                  Cerrar
                </button>
              </>
            )}

            {exportProgress.status === 'cancelled' && (
              <>
                <div style={{ fontSize: '3rem', color: 'var(--accent-primary)', marginBottom: '15px' }}>⏹</div>
                <h2 style={{ color: 'var(--accent-primary)', marginBottom: '10px' }}>Exportación Cancelada</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>La exportación ha sido cancelada por el usuario.</p>
                <button 
                  className="btn btn-secondary" 
                  style={{ margin: '0 auto', width: '150px' }}
                  onClick={() => {
                    setExportProgress(null);
                    setExporting(false);
                    setExportId(null);
                  }}
                >
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Twitch Input Modal */}
      {showTwitchInput && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '20px', maxWidth: '400px' }}>
            <h2 style={{ color: 'var(--accent-primary)', marginBottom: '15px', fontSize: '1.5rem' }}>Añadir Twitch VOD</h2>
            <input 
              type="text" 
              value={twitchUrl} 
              onChange={(e) => setTwitchUrl(e.target.value)} 
              placeholder="https://twitch.tv/videos/..." 
              style={{ width: '100%', padding: '12px', marginBottom: '20px', backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: '4px', fontSize: '1rem' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowTwitchInput(false)}>Cancelar</button>
              <button className="btn" onClick={() => submitTwitchVOD(twitchUrl)}>Aceptar</button>
            </div>
          </div>
        </div>
      )}

      {/* Format Selection Modal */}
      {showFormatSelection && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '20px', maxWidth: '400px' }}>
            <h2 style={{ color: 'var(--accent-primary)', marginBottom: '15px', fontSize: '1.5rem' }}>Selecciona la Calidad</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxHeight: '350px', overflowY: 'auto', paddingRight: '5px' }}>
              {streamFormats.map(f => (
                <button 
                  key={f.format_id}
                  className="btn btn-secondary" 
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '10px 15px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)' }}
                  onClick={() => {
                    applyStreamUrl(f.url);
                    setShowFormatSelection(false);
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>{f.format_note} {f.fps ? `(${f.fps}fps)` : ''}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{f.height ? `${f.height}p` : ''}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowFormatSelection(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Release 0.1.0 Notice Modal */}
      {showUpdateNotice && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '30px', maxWidth: '450px', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--gold)', marginBottom: '15px', fontSize: '1.8rem' }}>¡CutterGold 0.1.0!</h2>
            <h3 style={{ color: 'var(--accent-primary)', marginBottom: '20px', fontSize: '1.2rem' }}>Timeline multipista y ondas de audio</h3>
            <ul style={{ textAlign: 'left', color: 'var(--text-secondary)', marginBottom: '25px', lineHeight: '1.6', fontSize: '0.95rem', paddingLeft: '20px' }}>
              <li><strong>MULTIPISTA OBS:</strong> Escucha tus pistas sincronizadas y ajusta mute, solo y volumen por canal.</li>
              <li><strong>ONDAS REALES:</strong> Visualiza los picos y silencios de cada pista, alineados con la timeline.</li>
              <li><strong>PROCESAMIENTO:</strong> Sigue el porcentaje de preparación del audio y sus ondas.</li>
              <li><strong>VISTA PREVIA:</strong> Amplía el reproductor y previsualiza mientras arrastras el cabezal.</li>
              <li><strong>EXPORTACIÓN:</strong> Conserva las pistas de audio originales al exportar tus cortes.</li>
            </ul>
            <button className="btn btn-gold-glow" style={{ padding: '10px 30px', fontSize: '1.1rem' }} onClick={() => setShowUpdateNotice(false)}>
              Enterado
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
