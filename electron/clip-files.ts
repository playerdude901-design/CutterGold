import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export const categoryNames = ['Excelente', 'Bueno', 'Dudoso', 'Descartar'];
export function safeName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100);
  return !cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned) ? 'clip' : cleaned;
}
// Reserve names atomically: existing exports must never be overwritten.
export async function reserveOutput(directory: string, base: string, extension: string): Promise<string> {
  await fs.mkdir(directory, { recursive: true });
  for (let n = 0; ; n++) {
    const candidate = path.join(directory, `${safeName(base)}${n ? `_${n}` : ''}${extension}`);
    try { const handle = await fs.open(candidate, 'wx'); await handle.close(); return candidate; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
}
export async function moveExport(source: string, directory: string): Promise<string> {
  if (path.resolve(path.dirname(source)) === path.resolve(directory)) return source;
  await fs.mkdir(directory, { recursive: true });
  const extension = path.extname(source);
  const base = safeName(path.basename(source, extension));
  for (let n = 0; ; n++) {
    const destination = path.join(directory, `${base}${n ? `_${n}` : ''}${extension}`);
    try { await fs.copyFile(source, destination, constants.COPYFILE_EXCL); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
    try { await fs.unlink(source); }
    catch (error) { await fs.unlink(destination).catch(() => {}); throw error; }
    return destination;
  }
}
