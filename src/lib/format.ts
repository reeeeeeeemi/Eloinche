import type { GameStatus } from './types';

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export function timeLeft(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'imminente';
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `dans ${h} h`;
  return `dans ${Math.max(1, Math.floor(ms / 60000))} min`;
}

export const STATUS: Record<GameStatus, { label: string; color: string }> = {
  en_cours: { label: 'En cours', color: 'var(--teal)' },
  validee: { label: 'Validée', color: 'var(--ok)' },
  en_attente: { label: 'En attente', color: 'var(--wait)' },
  contestee: { label: 'Contestée', color: 'var(--ko)' },
};

export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
