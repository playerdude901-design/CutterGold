import { useEffect, useRef, useState } from 'react';
import './clipscore.css';

export function Settings({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    dialog.current!.showModal();
    if (!window.api) { setStatus('Abre CutterGold en Electron para configurar OpenRouter.'); return; }
    void window.api.getClipScoreSettings().then(settings => { setConfigured(settings.configured); setModel(settings.model); setReady(true); }).catch(() => setStatus('No se pudo cargar la configuración.'));
  }, []);
  async function save(remove = false) {
    setBusy(true);
    try {
      await window.api.saveClipScoreSettings({ apiKey: remove ? '' : key || undefined, model: model.trim() });
      setConfigured(remove ? false : Boolean(key) || configured);
      setKey(''); setStatus(remove ? 'Clave eliminada. Se usarán sugerencias locales.' : 'Configuración guardada.');
    } catch { setStatus('No se pudo guardar la clave de forma segura.'); }
    finally { setBusy(false); }
  }
  return <dialog className="cs-dialog" ref={dialog} aria-labelledby="settings-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="cs-shell cs-settings"><header className="cs-header"><h1 id="settings-title">Settings · ClipScore</h1><button className="btn btn-secondary" disabled={busy} onClick={onClose}>Cerrar</button></header>
      <p className="cs-muted">OpenRouter es opcional. Al abrir el resumen se enviarán únicamente cantidades por categoría y duración total para obtener una sugerencia de edición. Se utilizarán los créditos de tu cuenta.</p>
      <label>API key de OpenRouter<input type="password" autoComplete="off" value={key} placeholder={configured ? 'Clave guardada · deja vacío para conservarla' : 'Introduce tu API key'} onChange={e => setKey(e.target.value)} /></label>
      <label>Modelo (opcional)<input value={model} placeholder="Vacío: modelo predeterminado de tu cuenta" onChange={e => setModel(e.target.value)} /></label>
      <p className="cs-muted">La clave se guarda cifrada con la protección del sistema operativo. Si la IA falla, ClipScore muestra su sugerencia local.</p>
      <p role="status" className="cs-status">{status}</p><footer className="cs-footer"><button className="btn btn-secondary" disabled={!ready || busy || !configured} onClick={() => void save(true)}>Eliminar clave</button><button className="btn" disabled={!ready || busy} onClick={() => void save()}>Guardar</button></footer>
    </div>
  </dialog>;
}
