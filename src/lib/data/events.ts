/** Événement « la base a changé » : useData et la session se rechargent quand il est émis. */
export const DB_EVENT = 'coinche-db-change';

let timer: ReturnType<typeof setTimeout> | null = null;
/** Émet DB_EVENT (regroupe les rafales, ex. plusieurs lignes modifiées d'un coup). */
export function notifyDbChange() {
  if (typeof window === 'undefined') return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; window.dispatchEvent(new Event(DB_EVENT)); }, 80);
}
