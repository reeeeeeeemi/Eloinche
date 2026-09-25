import type { Round, RoundInput, Team } from './types';

export const TOTAL_POINTS = 160;
export const CAPOT = 250;
export const GENERALE = 500;
export const BELOTE = 20;
/** Fausse donne d'une paire, à partir de la 2e (et toutes les suivantes) : 160 pour l'adversaire, 0 pour elle. */
export const FAUSSE_DONNE_PENALTY = TOTAL_POINTS;

export const isSpecial = (c: RoundInput['contrat']) => c === 'capot' || c === 'generale';

/** Le contrat est-il réussi ? */
export function isReussi(r: RoundInput): boolean {
  if (r.fausse_donne) return false;
  if (isSpecial(r.contrat)) return !!r.reussi;
  const pts = r.points_preneur ?? 0, c = r.contrat as number;
  if (pts >= c) return true;
  // La belote du preneur aide à remplir le contrat, mais seulement s'il a fait plus que l'adversaire
  // (ex. 110 annoncé : 90 + belote = réussi ; 80 annoncé : 62 + belote = chuté car 62 < 98).
  return r.belote === r.preneur && pts > TOTAL_POINTS - pts && pts + BELOTE >= c;
}

/**
 * Règles :
 * - réussi : preneur = contrat + points, défense = 160 − points
 * - chuté  : preneur = 0, défense = 160 + contrat
 * - coinche/surcoinche : (160 + contrat) × 2/×4 au gagnant, 0 au perdant
 * - capot 250 / générale 500 (× coinche), tout au gagnant
 * - capot non annoncé (contrat chiffré) : l'équipe qui fait tous les plis compte 250 au lieu de 160
 * - belote : +20 à l'équipe qui l'annonce, quoi qu'il arrive
 * - la belote du preneur compte pour remplir le contrat s'il a fait plus que l'adversaire
 */
export function computeRound(r: RoundInput): { A: number; B: number } {
  const other: Team = r.preneur === 'A' ? 'B' : 'A';
  const s = { A: 0, B: 0 };
  const reussi = isReussi(r);

  if (isSpecial(r.contrat)) {
    const val = (r.contrat === 'generale' ? GENERALE : CAPOT) * r.coinche;
    s[reussi ? r.preneur : other] = val;
  } else {
    const c = r.contrat as number;
    const pts = r.points_preneur ?? 0;
    const pool = r.capot ? CAPOT : TOTAL_POINTS;
    if (r.coinche === 1) {
      if (reussi) {
        s[r.preneur] = c + (r.capot === r.preneur ? CAPOT : pts);
        s[other] = r.capot === r.preneur ? 0 : TOTAL_POINTS - pts;
      } else {
        s[other] = pool + c;
      }
    } else {
      s[reussi ? r.preneur : other] = (pool + c) * r.coinche;
    }
  }
  if (r.belote) s[r.belote] += BELOTE;
  return s;
}

/** Partie arrivée à son terme : une des deux paires a atteint l'objectif. */
export const isFinished = (scoreA: number, scoreB: number, target: number) =>
  Math.max(scoreA, scoreB) >= target;

export function buildRound(r: RoundInput): Round {
  const s = computeRound(r);
  return { ...r, reussi: isReussi(r), score_a: s.A, score_b: s.B };
}

/** Manche « fausse donne » (scores recalculés par withFaussesDonnes). */
export function fausseDonneRound(team: Team): Round {
  return { preneur: team, preneur_id: null, contrat: 0, coinche: 1, belote: null, fausse_donne: team, score_a: 0, score_b: 0 };
}

/**
 * Recalcule les points des fausses donnes dans l'ordre : la 1re d'une paire ne coûte rien,
 * à partir de la 2e (et toutes les suivantes) chacune donne 160 à l'autre paire. À rappeler après tout ajout / modif / suppression.
 */
export function withFaussesDonnes(rounds: Round[]): Round[] {
  const n = { A: 0, B: 0 };
  return rounds.map(r => {
    if (!r.fausse_donne) return r;
    const t = r.fausse_donne;
    n[t] += 1;
    const pen = n[t] >= 2 ? FAUSSE_DONNE_PENALTY : 0;
    return { ...r, score_a: t === 'B' ? pen : 0, score_b: t === 'A' ? pen : 0 };
  });
}

/** Rang de la fausse donne d'indice i pour sa paire (1re, 2e…). */
export function fausseDonneRank(rounds: Round[], i: number) {
  const t = rounds[i].fausse_donne;
  return rounds.slice(0, i + 1).filter(r => r.fausse_donne === t).length;
}

export function totals(rounds: Round[]) {
  return rounds.reduce((acc, r) => ({ A: acc.A + r.score_a, B: acc.B + r.score_b }), { A: 0, B: 0 });
}

export function contratLabel(c: RoundInput['contrat']) {
  if (c === 'capot') return 'Capot';
  if (c === 'generale') return 'Générale';
  return String(c);
}

export const ATOUTS = [
  { key: 'trefle', label: '♣', name: 'Trèfle' },
  { key: 'carreau', label: '♦', name: 'Carreau' },
  { key: 'coeur', label: '♥', name: 'Cœur' },
  { key: 'pique', label: '♠', name: 'Pique' },
  { key: 'ta', label: 'TA', name: 'Tout atout' },
  { key: 'sa', label: 'SA', name: 'Sans atout' },
] as const;
