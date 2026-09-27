import { isReussi } from './scoring';
import type { Round, Team } from './types';

export const BASE_ELO = 1000;
export const K = 32;

/**
 * Elo margin-based (identique à validate_game côté SQL).
 * Elo d'équipe = moyenne des 2 joueurs.
 * Bonus d'écart : écart/objectif, pondéré par la surprise du résultat — ×1 à égalité d'Elo,
 * moins pour un favori qui gagne large (c'était attendu), plus pour un outsider.
 * K effectif = 32 × (1 + bonus), borné entre ×1 (serré) et ×2 (raclée).
 */
export function eloDeltas(
  ra: number, rb: number, winner: Team, scoreA: number, scoreB: number, target: number,
): { A: number; B: number } {
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  // écart vu du vainqueur : 0 s'il gagne aux croix en étant derrière au score
  const gap = Math.max(0, winner === 'A' ? scoreA - scoreB : scoreB - scoreA);
  const frac = Math.max(0, Math.min(1, target > 0 ? gap / target : 0));
  const sa = winner === 'A' ? 1 : 0;
  const ew = sa === 1 ? ea : 1 - ea; // score attendu du vainqueur (0.5 = égalité)
  const keff = K * Math.min(2, 1 + frac * 2 * (1 - ew));
  // arrondi "loin de zéro", comme round() de Postgres
  const pgRound = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
  return { A: pgRound(keff * (sa - ea)), B: pgRound(keff * ((1 - sa) - (1 - ea))) };
}

/**
 * Répartition du delta d'équipe entre les 2 partenaires selon leurs prises.
 * Bilan de prises = contrats réussis − contrats chutés.
 * Chaque prise d'écart entre partenaires déplace 4 % du delta vers le meilleur bilan
 * (il gagne plus dans l'équipe gagnante, perd moins dans l'équipe perdante), plafonné à 20 %.
 * Volontairement faible : qui prend dépend surtout des cartes reçues.
 * La somme des 2 deltas reste 2 × delta : le total d'Elo échangé ne change pas.
 * Calcul en entiers pour tomber pile sur le même arrondi qu'en SQL.
 */
export const PRISE_PCT = 4;       // % du delta par prise d'écart
export const PRISE_MAX_STEPS = 5; // plafond : 5 prises d'écart = 20 %

export function splitTeamDelta(delta: number, bilan1: number, bilan2: number): [number, number] {
  const steps = Math.max(-PRISE_MAX_STEPS, Math.min(PRISE_MAX_STEPS, bilan1 - bilan2));
  const bonus = Math.sign(steps) * Math.round((Math.abs(delta) * Math.abs(steps) * PRISE_PCT) / 100);
  return [delta + bonus, delta - bonus];
}

/** Contrats réussis − contrats chutés d'un joueur sur la partie. */
export function bilanPrises(rounds: Round[], id: string) {
  return rounds.reduce((n, r) => (r.preneur_id !== id ? n : n + (isReussi(r) ? 1 : -1)), 0);
}
