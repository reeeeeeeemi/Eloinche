import type { Game, Team } from './types';

type Seated = Pick<Game, 'seats' | 'first_dealer' | 'rounds' | 'dealer_skips'>;

/** Équipe A = créateur + partenaire (places 0 et 2), équipe B = places 1 et 3. */
export const teamA = (g: Seated): [string, string] => [g.seats![0], g.seats![2]];
export const teamB = (g: Seated): [string, string] => [g.seats![1], g.seats![3]];
export const teamOf = (g: Seated, id: string): Team => (teamA(g).includes(id) ? 'A' : 'B');
/** Le donneur tourne d'un cran vers la gauche à chaque manche, et à chaque donne passée. */
export const dealerOf = (g: Seated) =>
  g.seats![((g.first_dealer ?? 0) + g.rounds.length + (g.dealer_skips ?? 0)) % 4];
