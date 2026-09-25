import { app, ipcMain, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

interface Settings { encryptedKey?: string; model: string }
const settingsPath = () => path.join(app.getPath('userData'), 'clipscore-settings.json');
async function read(): Promise<Settings> {
  try { return JSON.parse(await fs.readFile(settingsPath(), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { model: '' }; throw error; }
}
export function registerClipScoreSettings() {
  ipcMain.handle('clipscore-settings-get', async () => {
    const settings = await read();
    return { configured: Boolean(settings.encryptedKey), model: settings.model };
  });
  ipcMain.handle('clipscore-settings-save', async (_event, input: { apiKey?: string; model: string }) => {
    if (typeof input?.model !== 'string' || input.model.length > 200 || (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 2000))) throw new Error('Configuración inválida');
    const settings = await read();
    settings.model = input.model.trim();
    if (input.apiKey !== undefined) {
      if (!input.apiKey.trim()) delete settings.encryptedKey;
      else {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Cifrado del sistema no disponible');
        settings.encryptedKey = safeStorage.encryptString(input.apiKey.trim()).toString('base64');
      }
    }
    const temporary = settingsPath() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(settings), { mode: 0o600 });
    await fs.rename(temporary, settingsPath());
  });
  ipcMain.handle('clipscore-suggestion', async (_event, stats: { counts: Record<string, number>; duration: number }) => {
    try {
      const settings = await read();
      if (!settings.encryptedKey) return {};
      const names = ['Excelente', 'Bueno', 'Dudoso', 'Descartar'];
      if (!stats || !Number.isFinite(stats.duration) || stats.duration < 0 || names.some(name => !Number.isInteger(stats.counts?.[name]) || stats.counts[name] < 0)) throw new Error('Resumen inválido');
      const counts = Object.fromEntries(names.map(name => [name, stats.counts[name]]));
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${safeStorage.decryptString(Buffer.from(settings.encryptedKey, 'base64'))}`, 'Content-Type': 'application/json', 'X-OpenRouter-Title': 'CutterGold ClipScore' },
        body: JSON.stringify({ ...(settings.model ? { model: settings.model } : {}), max_tokens: 350,
          messages: [{ role: 'system', content: 'Eres editor de videos. Da una sugerencia breve en español basada únicamente en estas cantidades de clips y duración en segundos. No has visto los videos. Recomienda cómo priorizar categorías y ritmo de edición sin inventar contenido. Texto simple, máximo 120 palabras.' }, { role: 'user', content: JSON.stringify({ counts, duration: stats.duration }) }] }),
      });
      if (!response.ok) throw new Error('OpenRouter no disponible');
      const result = await response.json();
      const text = result.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new Error('Respuesta vacía');
      return { text: text.trim().slice(0, 3000) };
    } catch { return { error: 'No se pudo generar la sugerencia de IA.' }; }
  });
}
