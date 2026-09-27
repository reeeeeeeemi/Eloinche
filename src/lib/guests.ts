import type { Game, GamePlayerWithName } from './types';

/** Partie amicale : ajoute les invités sans compte aux joueurs, pour que l'affichage les traite comme les autres. */
export function withGuests(g: Game, players: GamePlayerWithName[]): GamePlayerWithName[] {
  if (!g.guest_names || !g.seats) return players;
  const guests = g.seats.flatMap((id, i): GamePlayerWithName[] => g.guest_names![id] ? [{
    game_id: g.id, profile_id: id, team: i % 2 === 0 ? 'A' : 'B', confirmed: true,
    elo_before: null, elo_delta: null, elo_after: null, display_name: g.guest_names![id], guest: true,
  }] : []);
  return [...players, ...guests];
}
