export interface Clip {
  id: string;
  name?: string;
  startTime: number;
  endTime: number;
  color: string;
  colorValue: string;
}

export const categories = ['Excelente', 'Bueno', 'Dudoso', 'Descartar'] as const;
export type Category = typeof categories[number];
export const questions = [
  { text: '¿La otra persona reaccionó?', options: ['Sí, fuerte', 'Algo', 'Casi nada', 'Nada'], points: [3, 2, 1, 0] },
  { text: '¿Hay un momento pico claro? (risa, grito, sorpresa)', options: ['Sí', 'No'], points: [2, 0] },
  { text: '¿La duración se siente bien o sobra?', options: ['Está bien', 'Sobra algo', 'Sobra mucho'], points: [2, 1, 0] },
  { text: '¿Lo usarías en el video?', options: ['Sí, directo', 'Tal vez', 'No'], points: [2, 1, 0] },
  { text: '¿Tiene potencial de momento viral o thumbnail?', options: ['Sí', 'No'], points: [1, 0] },
];
export type Answers = (number | undefined)[];
export type Reviews = Record<string, Answers>;
// Changing the source or cut boundaries requires a fresh review; colors and names do not.
export const reviewKey = (source: string, clip: Clip) => JSON.stringify([source, clip.id, clip.startTime, clip.endTime]);
export function scoreAnswers(answers: Answers): number | null {
  if (questions.some((q, i) => !Number.isInteger(answers[i]) || q.points[answers[i] as number] === undefined)) return null;
  return questions.reduce((sum, q, i) => sum + q.points[answers[i] as number], 0);
}
export function categoryFor(score: number): Category {
  return score >= 8 ? 'Excelente' : score >= 5 ? 'Bueno' : score >= 2 ? 'Dudoso' : 'Descartar';
}
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}
export function localSuggestion(counts: Record<Category, number>): string {
  if (counts.Excelente) return `Tienes ${counts.Excelente} clips excelentes. Prioriza sus momentos pico para un montaje ágil, con cortes cada 3–8 segundos cuando la escena lo permita. Los ${counts.Bueno} buenos pueden conectar esos momentos. Revisa los dudosos y deja los descartados fuera del montaje.`;
  if (counts.Bueno) return `Tienes ${counts.Bueno} clips buenos: construye una secuencia breve con ellos y recorta las pausas. Revisa si los dudosos contienen algún momento rescatable antes de añadirlos.`;
  return 'Todavía no hay clips buenos o excelentes. Vuelve a la timeline, busca reacciones más claras y acorta los tiempos muertos antes de montar el video.';
}
