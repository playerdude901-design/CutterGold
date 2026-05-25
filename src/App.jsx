import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Video, FolderOpen, Download, Play, Pause, Trash2, Plus } from 'lucide-react';
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
  
  // Interactive States
  const [activeClipId, setActiveClipId] = useState(null);
  const [dragInfo, setDragInfo] = useState(null);

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
      
      // Min/Max Zoom clamping (max 500 pixels per second to prevent infinite zoom/canvas crash)
      const minZoom = timelineScrollRef.current.clientWidth / duration;
      newZoom = Math.max(minZoom, Math.min(newZoom, 500));

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

    // Determine the step based on zoom level to prevent clutter
    let step = 1; // seconds
    if (zoomLevel > 1000) step = 0.05;
    else if (zoomLevel > 200) step = 0.1;
    else if (zoomLevel > 50) step = 1;
    else if (zoomLevel > 20) step = 5;
    else if (zoomLevel > 5) step = 10;
    else step = 60;

    for (let t = 0; t <= duration; t += step) {
      const x = t * zoomLevel;
      
      // Determine line height
      let lineH = 5;
      let isMajor = false;

      // Formatting
      if (Math.abs(t % 1) < 0.001) { // Whole second
        if (t % 10 === 0 && step >= 1) { // Major 10 second intervals
          lineH = 15;
          isMajor = true;
        } else if (t % 1 === 0 && step < 10) { // Whole seconds
          lineH = 10;
          if (step < 1) isMajor = true;
        }
      } else {
        // decimals
        lineH = 5;
      }

      ctx.fillRect(x - 0.5, height - lineH, 1, lineH);

      // Draw text
      if (isMajor || t === 0 || t === Math.floor(duration)) {
        ctx.fillText(formatTime(t), x, 2);
      }
    }
  }, [duration, zoomLevel]);

  const formatTime = (timeInSeconds) => {
    const hrs = Math.floor(timeInSeconds / 3600);
    const min = Math.floor((timeInSeconds % 3600) / 60);
    const sec = Math.floor(timeInSeconds % 60);
    const ms = Math.floor((timeInSeconds % 1) * 1000); // 3 digits
    return `${hrs.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
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
          <button className="btn" onClick={handleSelectVideo}>
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
                src={videoSrc}
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
                <div className="clip-times" style={{ margin: '15px 0' }}>
                  <div><strong>In:</strong> {formatTime(activeClip.startTime)}</div>
                  <div><strong>Out:</strong> {formatTime(activeClip.endTime)}</div>
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
    </div>
  );
}

export default App;
