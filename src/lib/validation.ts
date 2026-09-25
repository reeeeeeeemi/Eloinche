import type { GameWithPlayers } from './types';

/** La partie attend-elle ma confirmation ? (en attente, ou contestée par un autre que moi) */
export function awaitsMe(g: GameWithPlayers, uid: string | null) {
  const me = g.players.find(p => p.profile_id === uid);
  if (!me || me.confirmed) return false;
  return g.status === 'en_attente' || (g.status === 'contestee' && g.contested_by !== uid);
}

/** Joueurs qui doivent encore confirmer pour valider une partie contestée. */
export const missingOverride = (g: GameWithPlayers) =>
  g.players.filter(p => p.profile_id !== g.contested_by && !p.confirmed);
