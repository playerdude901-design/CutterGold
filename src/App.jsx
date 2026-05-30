import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Video, FolderOpen, Download, Play, Pause, Trash2, Plus, Link as LinkIcon } from 'lucide-react';
import Hls from 'hls.js';
import './App.css';

const COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Purple', value: '#a855f7' }
];

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const [outputDir, setOutputDir] = useState(null);
  const [clips, setClips] = useState([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportQuality, setExportQuality] = useState('source');
  const [exportProgress, setExportProgress] = useState(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [showTwitchInput, setShowTwitchInput] = useState(false);
  const [twitchUrl, setTwitchUrl] = useState('');
  const [streamFormats, setStreamFormats] = useState([]);
  const [showFormatSelection, setShowFormatSelection] = useState(false);
  const [showUpdateNotice, setShowUpdateNotice] = useState(true);
  
  // Interactive States
  const [activeClipId, setActiveClipId] = useState(null);
  const [dragInfo, setDragInfo] = useState(null);
  const [editingTime, setEditingTime] = useState({ id: null, type: null, value: '' });

  // Zoom & Pan States
  const [zoomLevel, setZoomLevel] = useState(20); // pixels per second
  const timelineScrollRef = useRef(null);
  const timelineTrackRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (window.api && window.api.onExportProgress) {
      window.api.onExportProgress((progress) => {
        setExportProgress(progress);
      });
    }
  }, []);

  const handleSelectVideo = async () => {
    if (window.api) {
      const filePath = await window.api.selectVideo();
      if (filePath) {
        setVideoFile(filePath);
        setVideoSrc(`file://${filePath}`);
        setClips([]);
        setActiveClipId(null);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          setVideoFile(file.path || file.name);
          setVideoSrc(URL.createObjectURL(file));
          setClips([]);
          setActiveClipId(null);
        }
      };
      input.click();
    }
  };

  const handleSelectOutputDir = async () => {
    if (window.api) {
      const dirPath = await window.api.selectOutputDir();
      if (dirPath) {
        setOutputDir(dirPath);
      }
    }
  };

  const applyStreamUrl = (url) => {
    setVideoFile(url);
    setVideoSrc(url);
    setClips([]);
    setActiveClipId(null);
  };

  const submitTwitchVOD = async (url) => {
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
          const uniqueFormats = res.formats.reduce((acc, current) => {
            const exists = acc.find(item => item.format_id === current.format_id);
            return exists ? acc : acc.concat([current]);
          }, []);
          setStreamFormats(uniqueFormats);
          setShowFormatSelection(true);
        } else {
          // Fallback a la calidad por defecto
          applyStreamUrl(res.url);
        }
      } else {
        alert("Error al obtener stream: " + res.error);
      }
    } catch (err) {
      alert("Error de conexión: " + err.message);
    } finally {
      setIsLoadingStream(false);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    
    let hls;
    if (videoSrc.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(videoSrc);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoSrc;
      }
    } else {
      video.src = videoSrc;
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [videoSrc]);

  const addClip = () => {
    if (!duration) return;
    const start = currentTime;
    const end = Math.min(currentTime + 5, duration);
    const newClip = {
      id: uuidv4(),
      startTime: start,
      endTime: end,
      color: COLORS[0].name,
      colorValue: COLORS[0].value
    };
    setClips([...clips, newClip]);
    setActiveClipId(newClip.id);
  };

  const removeClip = (id, e) => {
    if(e) e.stopPropagation();
    setClips(clips.filter(c => c.id !== id));
    if (activeClipId === id) setActiveClipId(null);
  };

  const updateActiveClipColor = (colorObj) => {
    if (!activeClipId) return;
    setClips(clips.map(c => c.id === activeClipId ? { ...c, color: colorObj.name, colorValue: colorObj.value } : c));
  };

  const parseTime = (timeStr) => {
    const parts = timeStr.split(':');
    let secs = 0;
    if (parts.length === 3) {
      secs += parseInt(parts[0] || 0) * 3600;
      secs += parseInt(parts[1] || 0) * 60;
      secs += parseFloat(parts[2] || 0);
    } else if (parts.length === 2) {
      secs += parseInt(parts[0] || 0) * 60;
      secs += parseFloat(parts[1] || 0);
    } else if (parts.length === 1) {
      secs += parseFloat(parts[0] || 0);
    }
    return isNaN(secs) ? 0 : secs;
  };

  const handleTimeEdit = (clipId, type, valueStr) => {
    const newTime = parseTime(valueStr);
    if (newTime >= 0 && newTime <= duration) {
      setClips(prevClips => prevClips.map(c => {
        if (c.id === clipId) {
          if (type === 'start') {
            const newStart = Math.min(newTime, c.endTime - 0.5);
            if (videoRef.current) videoRef.current.currentTime = newStart;
            return { ...c, startTime: newStart };
          } else {
            const newEnd = Math.max(newTime, c.startTime + 0.5);
            if (videoRef.current) videoRef.current.currentTime = newEnd;
            return { ...c, endTime: newEnd };
          }
        }
        return c;
      }));
    }
  };

  const handleExport = async () => {
    if (!window.api || !videoFile || !outputDir || clips.length === 0) return;
    setExporting(true);
    setExportProgress({ current: 0, total: clips.length, status: 'processing' });
    try {
      await window.api.exportClips({
        videoPath: videoFile,
        outputDir: outputDir,
        clips: clips,
        quality: exportQuality
      });
      // Instead of an alert, we update the modal state to 'done'
      setExportProgress({ status: 'done' });
    } catch (error) {
      console.error(error);
      setExportProgress({ status: 'error' });
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !dragInfo) {
      setCurrentTime(videoRef.current.currentTime);
      
      // Auto-scroll timeline to keep playhead in view when playing
      if (isPlaying && timelineScrollRef.current) {
        const playheadX = videoRef.current.currentTime * zoomLevel;
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
      setDuration(vidDuration);
      
      // Auto-fit timeline to screen width initially
      if (timelineScrollRef.current && vidDuration > 0) {
        const containerWidth = timelineScrollRef.current.clientWidth;
        // Calculate pixels per second needed to fit the whole duration exactly into the container
        let initialZoom = containerWidth / vidDuration;
        // Clamp to sensible defaults just in case
        initialZoom = Math.max(0.1, Math.min(initialZoom, 1000));
        setZoomLevel(initialZoom);
      }
    }
  };

  const handleTimelineClick = (e) => {
    if (dragInfo) return; 
    if (e.target.closest('.clip-marker') || e.target.closest('.playhead-handle')) return;
    
    if (!duration || !videoRef.current || !timelineTrackRef.current) return;
    const rect = timelineTrackRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / zoomLevel;
    const newTime = Math.max(0, Math.min(pos, duration));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setActiveClipId(null);
  };

  const jumpToClip = (clip) => {
    setActiveClipId(clip.id);
    if (videoRef.current) {
      videoRef.current.currentTime = clip.startTime;
      setCurrentTime(clip.startTime);
    }
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = Math.max(0, (clip.startTime * zoomLevel) - (timelineScrollRef.current.clientWidth / 2));
    }
  };

  // --- ZOOM & PAN (WHEEL LOGIC) ---
  const handleWheel = (e) => {
    if (!duration || !timelineScrollRef.current) return;

    if (e.altKey) {
      // Zoom
      e.preventDefault(); // Prevent browser zoom
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      const zoomMultiplier = 1 + zoomDelta;
      let newZoom = zoomLevel * zoomMultiplier;
      
      // Min/Max Zoom clamping
      // Browsers usually crash or fail to render canvas widths > 32,767 pixels.
      // We limit the total track width to 30,000 pixels.
      const MAX_CANVAS_WIDTH = 30000;
      const absoluteMaxZoom = MAX_CANVAS_WIDTH / duration;
      
      const minZoom = timelineScrollRef.current.clientWidth / duration;
      // We clamp newZoom between minZoom and the safe max zoom (with a hard cap of 500)
      newZoom = Math.max(minZoom, Math.min(newZoom, Math.min(500, absoluteMaxZoom)));

      // Keep cursor position stable relative to time
      const scrollContainer = timelineScrollRef.current;
      const containerRect = scrollContainer.getBoundingClientRect();
      const cursorX = e.clientX - containerRect.left;
      
      const timeAtCursor = (scrollContainer.scrollLeft + cursorX) / zoomLevel;
      const newScrollLeft = (timeAtCursor * newZoom) - cursorX;

      setZoomLevel(newZoom);
      
      // Allow React to re-render, then set scrollLeft
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
  const handleClipMouseDown = (e, id, type) => {
    e.stopPropagation();
    setActiveClipId(id);
    const clip = clips.find(c => c.id === id);
    if (!clip) return;
    
    setDragInfo({
      id,
      type, // 'move', 'start', 'end'
      startX: e.clientX,
      initialStart: clip.startTime,
      initialEnd: clip.endTime
    });
  };

  const handlePlayheadMouseDown = (e) => {
    e.stopPropagation();
    setDragInfo({
      id: 'playhead',
      type: 'playhead',
      startX: e.clientX,
      initialStart: currentTime
    });
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragInfo || !duration) return;
    
    const deltaX = e.clientX - dragInfo.startX;
    const deltaSeconds = deltaX / zoomLevel;
    
    if (dragInfo.type === 'playhead') {
      const newTime = Math.max(0, Math.min(dragInfo.initialStart + deltaSeconds, duration));
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
      }
      setCurrentTime(newTime);
      return;
    }

    setClips(prevClips => prevClips.map(clip => {
      if (clip.id !== dragInfo.id) return clip;
      
      let newStart = clip.startTime;
      let newEnd = clip.endTime;
      const MIN_DURATION = 0.5;
      
      if (dragInfo.type === 'move') {
        const clipDuration = dragInfo.initialEnd - dragInfo.initialStart;
        newStart = Math.max(0, Math.min(dragInfo.initialStart + deltaSeconds, duration - clipDuration));
        newEnd = newStart + clipDuration;
      } else if (dragInfo.type === 'start') {
        newStart = Math.max(0, Math.min(dragInfo.initialStart + deltaSeconds, dragInfo.initialEnd - MIN_DURATION));
      } else if (dragInfo.type === 'end') {
        newEnd = Math.max(dragInfo.initialStart + MIN_DURATION, Math.min(dragInfo.initialEnd + deltaSeconds, duration));
      }

      if (videoRef.current) {
        if (dragInfo.type === 'start' || dragInfo.type === 'move') {
          videoRef.current.currentTime = newStart;
          setCurrentTime(newStart);
        } else if (dragInfo.type === 'end') {
          videoRef.current.currentTime = newEnd;
          setCurrentTime(newEnd);
        }
      }

      return { ...clip, startTime: newStart, endTime: newEnd };
    }));
  }, [dragInfo, duration, zoomLevel]);

  const handleMouseUp = useCallback(() => {
    if (dragInfo) {
      setDragInfo(null);
    }
  }, [dragInfo]);

  useEffect(() => {
    if (dragInfo) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragInfo, handleMouseMove, handleMouseUp]);

  // Block native wheel on the container to intercept zoom/pan safely
  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const preventDefaultScroll = (e) => {
      if (e.altKey || e.ctrlKey) e.preventDefault();
    };
    el.addEventListener('wheel', preventDefaultScroll, { passive: false });
    return () => el.removeEventListener('wheel', preventDefaultScroll);
  }, []);

  // --- CANVAS TIMELINE RULER ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;
    
    const ctx = canvas.getContext('2d');
    const width = duration * zoomLevel;
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

    for (let t = 0; t <= duration; t += minorStep) {
      const x = t * zoomLevel;
      
      // Floating point math safe modulo
      const mod = t % majorStep;
      const isMajor = mod < minorStep / 2 || (majorStep - mod) < minorStep / 2;

      let lineH = isMajor ? 15 : 5;

      ctx.fillRect(x - 0.5, height - lineH, 1, lineH);

      // Draw text for major ticks or first/last
      if (isMajor || t === 0 || t === Math.floor(duration)) {
        ctx.fillText(formatTime(t, showMs), x, 2);
      }
    }
  }, [duration, zoomLevel]);

  const formatTime = (timeInSeconds, showMs = true) => {
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
  const trackWidth = duration * zoomLevel;

  const clipsByColor = COLORS.map(c => ({
    ...c,
    items: clips.filter(clip => clip.color === c.name)
  })).filter(c => c.items.length > 0);

  return (
    <div className="app-container">
      <header className="header glass-panel">
        <h1 className="app-title"><span className="text-grey">Cutter</span><span className="text-gold-shine">Gold</span></h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={() => setShowTwitchInput(true)} disabled={isLoadingStream}>
            <LinkIcon size={18} /> {isLoadingStream ? 'Cargando...' : 'Añadir Twitch VOD'}
          </button>
          <button className="btn" onClick={handleSelectVideo} disabled={isLoadingStream}>
            <Video size={18} /> Select Video
          </button>
          <button className="btn btn-secondary" onClick={handleSelectOutputDir}>
            <FolderOpen size={18} /> {outputDir ? 'Change Output' : 'Select Output'}
          </button>
        </div>
      </header>

      <main className="main-content">
        <section className="video-section">
          <div className="video-container glass-panel">
            {videoSrc ? (
              <video
                ref={videoRef}
                className="video-element"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={togglePlay}
              />
            ) : (
              <div className="placeholder-video">
                <Video size={48} opacity={0.5} />
                <p>No video selected</p>
              </div>
            )}
          </div>

          <div className="timeline-container glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', fontWeight: 'bold' }}>{formatTime(currentTime)}</span>
              <button className="btn" style={{ padding: '5px 10px' }} onClick={togglePlay}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{formatTime(duration)}</span>
            </div>
            
            <div 
              className="timeline-scroll-area" 
              ref={timelineScrollRef}
              onWheel={handleWheel}
            >
              <div 
                className="timeline-track" 
                ref={timelineTrackRef} 
                onClick={handleTimelineClick}
                style={{ width: duration ? `${trackWidth}px` : '100%', minWidth: '100%' }}
              >
                {/* CANVAS RULER */}
                {duration > 0 && <canvas ref={canvasRef} className="timeline-canvas" />}

                {/* CLIPS */}
                {clips.map(clip => {
                  const leftPx = clip.startTime * zoomLevel;
                  const widthPx = (clip.endTime - clip.startTime) * zoomLevel;
                  const isActive = clip.id === activeClipId;
                  
                  return (
                    <div 
                      key={clip.id}
                      className={`clip-marker ${isActive ? 'active' : ''}`}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                        backgroundColor: clip.colorValue,
                        zIndex: isActive ? 10 : 1
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'move')}
                    >
                      <div 
                        className="clip-handle clip-handle-left"
                        onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'start')}
                      />
                      <div 
                        className="clip-handle clip-handle-right"
                        onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'end')}
                      />
                    </div>
                  )
                })}

                {/* DRAGGABLE PLAYHEAD */}
                <div 
                  className="playhead" 
                  style={{ left: `${currentTime * zoomLevel}px` }} 
                >
                  <div className="playhead-handle" onMouseDown={handlePlayheadMouseDown} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="sidebar glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Clips ({clips.length})</h2>
            <button className="btn" onClick={addClip} disabled={!videoSrc}>
              <Plus size={18} /> Add Clip
            </button>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Active Clip Editor */}
            {activeClip && (
              <div className="active-clip-editor" style={{ border: '1px solid var(--accent-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ color: 'var(--accent-primary)', margin: 0 }}>Editar Selección</h3>
                  <button onClick={() => setActiveClipId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
                </div>
                <div className="clip-times" style={{ margin: '15px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <strong style={{ width: '40px' }}>In:</strong> 
                    <input 
                      type="text" 
                      value={editingTime.id === activeClip.id && editingTime.type === 'start' ? editingTime.value : formatTime(activeClip.startTime)}
                      onChange={(e) => setEditingTime({ id: activeClip.id, type: 'start', value: e.target.value })}
                      onFocus={() => setEditingTime({ id: activeClip.id, type: 'start', value: formatTime(activeClip.startTime) })}
                      onBlur={(e) => {
                        handleTimeEdit(activeClip.id, 'start', e.target.value);
                        setEditingTime({ id: null, type: null, value: '' });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleTimeEdit(activeClip.id, 'start', e.target.value);
                          setEditingTime({ id: null, type: null, value: '' });
                        }
                      }}
                      style={{ flex: 1, padding: '5px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <strong style={{ width: '40px' }}>Out:</strong> 
                    <input 
                      type="text" 
                      value={editingTime.id === activeClip.id && editingTime.type === 'end' ? editingTime.value : formatTime(activeClip.endTime)}
                      onChange={(e) => setEditingTime({ id: activeClip.id, type: 'end', value: e.target.value })}
                      onFocus={() => setEditingTime({ id: activeClip.id, type: 'end', value: formatTime(activeClip.endTime) })}
                      onBlur={(e) => {
                        handleTimeEdit(activeClip.id, 'end', e.target.value);
                        setEditingTime({ id: null, type: null, value: '' });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleTimeEdit(activeClip.id, 'end', e.target.value);
                          setEditingTime({ id: null, type: null, value: '' });
                        }
                      }}
                      style={{ flex: 1, padding: '5px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '4px', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ marginBottom: '10px' }}>Color (Carpeta de destino):</p>
                  <div className="color-picker" style={{ display: 'flex', gap: '10px' }}>
                    {COLORS.map(c => (
                      <div 
                        key={c.name}
                        className={`color-swatch ${activeClip.color === c.name ? 'active' : ''}`}
                        style={{ backgroundColor: c.value, width: '32px', height: '32px' }}
                        onClick={() => updateActiveClipColor(c)}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>

                <button className="btn" style={{ width: '100%', backgroundColor: 'var(--danger)', color: 'white' }} onClick={(e) => removeClip(activeClip.id, e)}>
                  <Trash2 size={16} /> Eliminar Clip
                </button>
              </div>
            )}

            {/* Clips List & Filter */}
            <div className="clips-filter-list">
              <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                Resumen de Cortes
              </h3>
              
              {clipsByColor.length === 0 ? (
                 <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '20px', fontSize: '0.9rem' }}>
                   No hay clips creados.
                 </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {clipsByColor.map(category => (
                    <div key={category.name} style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: category.value }} />
                        <strong style={{ fontSize: '0.9rem' }}>{category.name}</strong>
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{category.items.length} clips</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {category.items.map((clip, index) => (
                          <button 
                            key={clip.id}
                            onClick={() => jumpToClip(clip)}
                            style={{ 
                              background: activeClipId === clip.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                              color: activeClipId === clip.id ? '#111' : 'var(--text-primary)',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              fontWeight: activeClipId === clip.id ? 'bold' : 'normal'
                            }}
                          >
                            Clip {index + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '15px', marginTop: 'auto' }}>
            <div style={{ marginBottom: '15px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Output:</strong> {outputDir || 'Not selected'}
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <p style={{ marginBottom: '8px', fontSize: '0.9rem', color: 'var(--accent-primary)' }}><strong>Export Quality:</strong></p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="radio" name="quality" value="fhd" checked={exportQuality === 'fhd'} onChange={(e) => setExportQuality(e.target.value)} />
                  FHD (1080p)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="radio" name="quality" value="hd" checked={exportQuality === 'hd'} onChange={(e) => setExportQuality(e.target.value)} />
                  HD (720p)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="radio" name="quality" value="source" checked={exportQuality === 'source'} onChange={(e) => setExportQuality(e.target.value)} />
                  Source
                </label>
              </div>
            </div>

            <button 
              className="btn btn-gold-glow" 
              style={{ width: '100%', padding: '15px', fontSize: '1.1rem' }}
              onClick={handleExport}
              disabled={!videoFile || !outputDir || clips.length === 0 || exporting}
            >
              {exporting ? 'Exporting...' : <><Download size={20} /> Export All Clips</>}
            </button>
          </div>
        </aside>
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
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>Ocurrió un error al procesar los videos.</p>
                <button 
                  className="btn btn-secondary" 
                  style={{ margin: '0 auto', width: '150px' }}
                  onClick={() => {
                    setExportProgress(null);
                    setExporting(false);
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

      {/* Update 0.0.5 Notice Modal */}
      {showUpdateNotice && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '30px', maxWidth: '450px', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--gold)', marginBottom: '15px', fontSize: '1.8rem' }}>¡CutterGold 0.0.5!</h2>
            <h3 style={{ color: 'var(--accent-primary)', marginBottom: '20px', fontSize: '1.2rem' }}>Features & Fixes</h3>
            <ul style={{ textAlign: 'left', color: 'var(--text-secondary)', marginBottom: '25px', lineHeight: '1.6', fontSize: '0.95rem', paddingLeft: '20px' }}>
              <li><strong>HOTFIX:</strong> Corregido error al importar Twitch VODs en la versión instalable de producción.</li>
              <li><strong>NUEVO:</strong> Integración de Twitch VODs. ¡Solo pega el link!</li>
              <li><strong>NUEVO:</strong> Selector de calidades al importar streams.</li>
              <li><strong>NUEVO:</strong> Edición manual de tiempos en el panel lateral.</li>
              <li><strong>FIX:</strong> La línea de tiempo ahora es adaptativa con límite de zoom.</li>
              <li><strong>FIX:</strong> Los cortes en los streams se exportan en `.mp4` correctamente.</li>
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
