import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { categories, categoryFor, formatDuration, localSuggestion, questions, reviewKey, scoreAnswers } from './model';
import type { Clip, Reviews, Category } from './model';
import './clipscore.css';

function Preview({ source, clip, muted }: { source: string; clip: Clip; muted: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [position, setPosition] = useState(clip.startTime);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const video = ref.current!;
    let hls: Hls | undefined;
    let frame = 0;
    let disposed = false;
    const play = () => {
      video.currentTime = clip.startTime;
      void video.play().catch(() => { if (!disposed) setError('Pulsa Reproducir para iniciar el clip.'); });
    };
    const constrain = () => {
      if (video.currentTime >= clip.endTime) {
        video.pause();
        video.currentTime = clip.startTime;
      } else if (video.currentTime < clip.startTime) video.currentTime = clip.startTime;
    };
    const tick = () => { constrain(); frame = requestAnimationFrame(tick); };
    video.addEventListener('loadedmetadata', play);
    video.addEventListener('seeking', constrain);
    video.addEventListener('timeupdate', constrain);
    if (source.includes('.m3u8') && Hls.isSupported()) {
      hls = new Hls({ startPosition: clip.startTime });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError('No se pudo cargar el stream. Vuelve a cargar el VOD desde la timeline.');
      });
    } else video.src = source;
    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      video.pause();
      video.removeEventListener('loadedmetadata', play);
      video.removeEventListener('seeking', constrain);
      video.removeEventListener('timeupdate', constrain);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [source, clip.startTime, clip.endTime]);
  return <div className="cs-preview">
    <video ref={ref} muted={muted} playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={() => setPosition(ref.current!.currentTime)} onError={() => setError('No se pudo reproducir este video. Comprueba que la fuente siga disponible.')} />
    <input className="cs-seek" type="range" aria-label="Posición dentro del clip" min={clip.startTime} max={clip.endTime} step={0.01} value={position} onChange={e => { ref.current!.currentTime = Number(e.target.value); setPosition(Number(e.target.value)); }} />
    <div className="cs-actions">
      <button className="btn btn-secondary" onClick={() => {
        const video = ref.current!;
        if (video.paused) void video.play().then(() => setError('')).catch(() => setError('No se pudo iniciar la reproducción.'));
        else video.pause();
      }}>{playing ? 'Pausar' : 'Reproducir'}</button>
      <button className="btn btn-secondary" onClick={() => { ref.current!.currentTime = clip.startTime; }}>Repetir desde el inicio</button>
    </div>
    {error && <p role="status">{error}</p>}
  </div>;
}

interface Props {
  source: string;
  videoPath: string;
  clips: Clip[];
  reviews: Reviews;
  onReviews: (reviews: Reviews) => void;
  quality: 'source' | 'hd' | 'fhd';
  onClose: () => void;
}

export function ClipScore({ source, videoPath, clips: inputClips, reviews, onReviews, quality, onClose }: Props) {
  const clips = [...inputClips].sort((a, b) => a.startTime - b.startTime);
  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState(false);
  const [muted, setMuted] = useState(false);
  const [selected, setSelected] = useState<Category[]>([...categories]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [aiStatus, setAiStatus] = useState('Sugerencia local');
  const dialog = useRef<HTMLDialogElement>(null);
  const exportId = useRef<string | null>(null);
  useEffect(() => { dialog.current!.showModal(); }, []);
  useEffect(() => window.api?.onExportProgress(progress => {
    if (exportId.current && progress.status === 'processing') setStatus(`Exportando clip ${progress.current} de ${progress.total}…`);
  }), []);
  const clip = clips[index];
  const key = reviewKey(videoPath, clip);
  const answers = reviews[key] ?? [];
  const score = scoreAnswers(answers);
  const rated = clips.map(c => ({ ...c, score: scoreAnswers(reviews[reviewKey(videoPath, c)] ?? []) }));
  const complete = rated.every(c => c.score !== null);
  const counts = Object.fromEntries(categories.map(category => [category, rated.filter(c => c.score !== null && categoryFor(c.score) === category).length])) as Record<Category, number>;
  const selectedClips = rated.filter(c => c.score !== null && selected.includes(categoryFor(c.score)));
  const totalDuration = selectedClips.reduce((sum, c) => sum + c.endTime - c.startTime, 0);
  const stats = JSON.stringify({ counts, duration: rated.reduce((sum, c) => sum + c.endTime - c.startTime, 0) });
  useEffect(() => {
    if (!summary) return;
    let stale = false;
    setSuggestion('');
    setAiStatus('Sugerencia local');
    if (window.api?.clipScoreSuggestion) {
      setAiStatus('Consultando sugerencia…');
      void window.api.clipScoreSuggestion(JSON.parse(stats)).then(result => {
        if (stale) return;
        if (result.text) { setSuggestion(result.text); setAiStatus('Sugerencia de OpenRouter'); }
        else setAiStatus(result.error ? 'Sugerencia local · OpenRouter no está disponible' : 'Sugerencia local');
      }).catch(() => { if (!stale) setAiStatus('Sugerencia local · OpenRouter no está disponible'); });
    }
    return () => { stale = true; };
  }, [summary, stats]);

  const exportSelection = async () => {
    if (!window.api) { setStatus('La exportación requiere abrir CutterGold en Electron.'); return; }
    setBusy(true);
    setStatus('Selecciona la carpeta de destino…');
    const id = crypto.randomUUID();
    try {
      const outputDir = await window.api.selectOutputDir();
      if (!outputDir) { setStatus('Exportación cancelada.'); return; }
      exportId.current = id;
      setStatus(`Exportando ${selectedClips.length} clips…`);
      const result = await window.api.exportClips({ videoPath, outputDir, quality, exportId: id,
        clips: selectedClips.map(c => ({ ...c, category: categoryFor(c.score!) })) });
      setStatus(result.success ? `${result.files?.length ?? 0} clips guardados en ${outputDir}` :
        `${result.cancelled ? 'Exportación cancelada' : result.error || 'Error de exportación'}. ${result.files?.length ?? 0} clips completados; puedes reintentar.`);
    } catch { setStatus('No se pudo exportar. Comprueba la carpeta de destino y vuelve a intentarlo.'); }
    finally { setBusy(false); exportId.current = null; }
  };

  return <dialog ref={dialog} className="cs-dialog" aria-labelledby="cs-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="cs-shell">
      <header className="cs-header">
        <div><span className="cs-eyebrow">CUTTERGOLD / CLIPSCORE</span><h1 id="cs-title">{summary ? 'Resumen de revisión' : 'Encuentra tus mejores momentos'}</h1></div>
        <div className="cs-actions"><button className="btn btn-secondary" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? 'Activar sonido' : 'Silenciar'}</button><button className="btn btn-secondary" disabled={busy} onClick={onClose}>Editar selección</button></div>
      </header>
      {!summary ? <>
        <div className="cs-progress-label"><span>Clip {index + 1} de {clips.length}</span><span>{rated.filter(c => c.score !== null).length} revisados</span></div>
        <progress max={clips.length} value={index + 1} aria-label="Progreso de revisión" />
        <div className="cs-review">
          <section><Preview key={key} source={source} clip={clip} muted={muted} />
            <div className="cs-clip-name"><span className="cs-dot" style={{ background: clip.colorValue }} /><h2>{clip.name || `Clip ${index + 1}`}</h2><span>{formatDuration(clip.endTime - clip.startTime)}</span></div>
            <p className="cs-muted">{formatDuration(clip.startTime)} → {formatDuration(clip.endTime)} · {clip.color}</p>
            <div className="cs-score">{score === null ? 'Responde las 5 preguntas para calificar' : `${score}/10 · ${categoryFor(score)}`}</div>
          </section>
          <section className="cs-questions" aria-label="Calificar clip">{questions.map((question, qi) => <fieldset key={question.text}>
            <legend>{qi + 1}. {question.text}</legend><div className="cs-chips">{question.options.map((option, oi) => <button key={option} className="cs-chip" aria-pressed={answers[qi] === oi} onClick={() => {
              const next = [...answers]; next[qi] = oi; onReviews({ ...reviews, [key]: next });
            }}>{option}</button>)}</div>
          </fieldset>)}</section>
        </div>
        <footer className="cs-footer"><button className="btn btn-secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Anterior</button>
          {index < clips.length - 1 ? <button className="btn" disabled={score === null} onClick={() => setIndex(index + 1)}>Siguiente →</button> : <button className="btn" disabled={!complete} onClick={() => setSummary(true)}>Ver resumen</button>}
        </footer>
      </> : <>
        <p className="cs-muted">Selecciona las categorías que quieres exportar.</p>
        <div className="cs-categories">{categories.map((category, i) => <button className="cs-category" key={category} aria-pressed={selected.includes(category)} onClick={() => { if (!busy) setSelected(selected.includes(category) ? selected.filter(c => c !== category) : [...selected, category]); }} disabled={busy}>
          <span className="cs-category-icon">{['✅', '👍', '🤔', '🗑️'][i]}</span><h2>{category}</h2><strong>{counts[category]} clips</strong><span>{Math.round(counts[category] / clips.length * 100)}%</span><small>{selected.includes(category) ? 'Incluida' : 'Excluida'}</small>
        </button>)}</div>
        <section className="cs-summary-panel"><span className="cs-eyebrow">MATERIAL SELECCIONADO</span><h2>{formatDuration(totalDuration)} <small>· {selectedClips.length} clips</small></h2></section>
        <section className="cs-summary-panel"><span className="cs-eyebrow">{aiStatus}</span><p>{suggestion || localSuggestion(counts)}</p></section>
        <p className="cs-muted">Los clips ya exportados en esta sesión se mueven a su categoría. Los pendientes se recortan con la calidad elegida en la timeline. El video fuente se conserva.</p>
        <p role="status" className="cs-status">{status}</p>
        <footer className="cs-footer"><button className="btn btn-secondary" disabled={busy} onClick={() => setSummary(false)}>← Revisar respuestas</button><div className="cs-actions">
          {busy && <button className="btn btn-secondary" onClick={() => { if (exportId.current) void window.api.cancelExport(exportId.current); }}>Cancelar exportación</button>}
          <button className="btn" disabled={busy || !selectedClips.length} onClick={() => void exportSelection()}>{busy ? 'Exportando…' : 'Exportar clips'}</button>
        </div></footer>
      </>}
    </div>
  </dialog>;
}
