import type { Game, Round, RoundInput, Team } from './types';

export const TOTAL_POINTS = 162;
export const CAPOT = 250;
export const GENERALE = 500;
export const BELOTE = 20;
/** Tout atout : une belote possible par couleur, 5 points chacune (4 au plus, soit 20). */
export const BELOTE_TA = 5;
export const BELOTES_TA_MAX = 4;
/** Fausse donne d'une paire, à partir de la 2e (et toutes les suivantes) : 160 pour l'adversaire, 0 pour elle. */
export const FAUSSE_DONNE_PENALTY = 160;
/** Capot non annoncé : une petite croix pour la paire qui le fait ; à 3 croix, elle perd la partie. */
export const CROIX_MAX = 3;

/** Points marqués arrondis à la dizaine, 5 vers le haut (85 → 90, 84 → 80, 162 → 160). */
export const arrondi = (x: number) => Math.round(x / 10) * 10;

/** Points de belote d'une paire (20, ou 5 par belote en tout atout). */
export function belotePts(r: RoundInput, t: Team): number {
  if (r.atout === 'ta') return (r.belotes_ta?.[t] ?? 0) * BELOTE_TA;
  return r.belote === t ? BELOTE : 0;
}

/** Mention de la belote dans le détail d'une manche (« , belote », « , 3 belotes »). */
export function beloteLabel(r: RoundInput): string {
  if (r.atout !== 'ta') return r.belote ? ', belote' : '';
  const n = (r.belotes_ta?.A ?? 0) + (r.belotes_ta?.B ?? 0);
  return n === 0 ? '' : n === 1 ? ', 1 belote' : `, ${n} belotes`;
}

export const isSpecial = (c: RoundInput['contrat']) => c === 'capot' || c === 'generale';

/** Le contrat est-il réussi ? */
export function isReussi(r: RoundInput): boolean {
  if (r.fausse_donne) return false;
  if (isSpecial(r.contrat)) return !!r.reussi;
  const pts = r.points_preneur ?? 0, c = r.contrat as number;
  // Il faut toujours faire plus que l'adversaire, soit plus de 81 sur 162 (ex. 80 annoncé : 81 = chuté, 82 = réussi).
  if (pts <= TOTAL_POINTS - pts) return false;
  if (pts >= c) return true;
  // La belote du preneur aide à remplir le contrat, à la même condition
  // (ex. 110 annoncé : 90 + belote = réussi ; 100 annoncé : 80 + belote = chuté car 80 ≤ 81).
  // En tout atout, ce sont ses belotes à 5 points qui comptent.
  return pts + belotePts(r, r.preneur) >= c;
}

/**
 * Règles (la réussite se juge sur les points exacts, les points marqués sont arrondis à la dizaine) :
 * - réussi (contrat atteint et plus de 81) : preneur = contrat + points, défense = 162 − points
 * - chuté  : preneur = 0, défense = 160 + contrat (162 arrondi)
 * - coinche/surcoinche : (160 + contrat) × 2/×4 au gagnant, 0 au perdant
 * - capot 250 / générale 500 (× coinche), tout au gagnant
 * - capot non annoncé (contrat chiffré) : l'équipe qui fait tous les plis compte 250 au lieu de 162
 * - belote : +20 à l'équipe qui l'annonce, quoi qu'il arrive (tout atout : +5 par belote, 4 au plus)
 * - la belote du preneur compte pour remplir le contrat s'il a fait plus que l'adversaire (plus de 81)
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
    const pool = r.capot ? CAPOT : arrondi(TOTAL_POINTS);
    if (r.coinche === 1) {
      if (reussi) {
        s[r.preneur] = c + (r.capot === r.preneur ? CAPOT : arrondi(pts));
        s[other] = r.capot === r.preneur ? 0 : arrondi(TOTAL_POINTS - pts);
      } else {
        s[other] = pool + c;
      }
    } else {
      s[reussi ? r.preneur : other] = (pool + c) * r.coinche;
    }
  }
  s.A += belotePts(r, 'A');
  s.B += belotePts(r, 'B');
  return s;
}

/** Petites croix de chaque paire (une par capot non annoncé). */
export function croix(rounds: RoundInput[]) {
  const n = { A: 0, B: 0 };
  rounds.forEach(r => { if (r.capot) n[r.capot] += 1; });
  return n;
}

/** Paire qui perd aux croix : la première à atteindre 3 capots non annoncés, sinon null. */
export function perdantCroix(rounds: RoundInput[]): Team | null {
  const n = { A: 0, B: 0 };
  for (const r of rounds) {
    if (!r.capot) continue;
    if (++n[r.capot] >= CROIX_MAX) return r.capot;
  }
  return null;
}

/** Vainqueur : l'adversaire de la paire à 3 croix, sinon la paire qui a le plus de points. */
export function winnerOf(rounds: RoundInput[], scoreA: number, scoreB: number): Team {
  const l = perdantCroix(rounds);
  if (l) return l === 'A' ? 'B' : 'A';
  return scoreA >= scoreB ? 'A' : 'B';
}

/** Partie arrivée à son terme : une des deux paires a atteint l'objectif, ou a pris 3 croix. */
export const isFinished = (g: Pick<Game, 'score_a' | 'score_b' | 'target' | 'rounds'>) =>
  Math.max(g.score_a, g.score_b) >= g.target || perdantCroix(g.rounds) !== null;

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
