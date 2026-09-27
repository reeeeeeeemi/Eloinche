// Types calqués 1:1 sur les tables Supabase (supabase/schema.sql)

export type Team = 'A' | 'B';
// en_cours : manches en train d'être saisies · en_attente : terminée, attend validation
export type GameStatus = 'en_cours' | 'en_attente' | 'validee' | 'contestee';
export type Atout = 'trefle' | 'carreau' | 'coeur' | 'pique' | 'ta' | 'sa';
export type Contrat = number | 'capot' | 'generale';
export type Coinche = 1 | 2 | 4;

export interface RoundInput {
  preneur: Team;
  preneur_id?: string | null;   // joueur individuel qui a pris
  contrat: Contrat;
  points_preneur?: number;      // points réalisés par l'équipe preneuse (/162), hors capot/générale
  atout?: Atout | null;
  coinche: Coinche;
  belote: Team | null;
  capot?: Team | null;          // capot non annoncé réalisé sur un contrat chiffré (250 au lieu de 162)
  fausse_donne?: Team | null;   // manche = fausse donne de cette paire (pas de contrat joué)
  reussi?: boolean;             // saisi pour capot / générale, calculé et stocké pour les autres
}

export interface Round extends RoundInput {
  score_a: number;
  score_b: number;
}

export interface Profile {
  id: string;
  display_name: string;
  elo: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  created_at: string;
  status: 'en_attente' | 'accepte' | 'refuse'; // accès validé par l'admin
  is_admin?: boolean;
}

/** Demande d'accès (compte non accepté), vue par l'admin uniquement. */
export interface JoinRequest {
  id: string;
  display_name: string;
  email: string | null;
  status: 'en_attente' | 'refuse';
  created_at: string;
}

export interface Game {
  id: string;
  created_by: string;
  created_at: string;
  target: number;
  score_a: number;
  score_b: number;
  winner: Team;
  rounds: Round[];
  status: GameStatus;
  validate_deadline: string | null;   // fixée quand la partie se termine
  validated_at: string | null;
  // Places autour de la table (sens horaire) : [créateur, sa gauche, son partenaire, sa droite]
  seats?: [string, string, string, string] | null;
  first_dealer?: number | null;       // index dans seats
  dealer_skips?: number;              // donnes passées sans contrat (personne n'a pris)
  contested_by?: string | null;       // joueur qui a contesté (la partie compte si les 3 autres confirment)
}

export interface GamePlayer {
  game_id: string;
  profile_id: string;
  team: Team;
  confirmed: boolean;
  elo_before: number | null;
  elo_delta: number | null;
  elo_after: number | null;
}

export interface GamePlayerWithName extends GamePlayer {
  display_name: string;
}

export interface GameWithPlayers extends Game {
  players: GamePlayerWithName[];
}

export interface EloPoint {
  game_id: string;
  date: string;
  elo_after: number;
  elo_delta: number;
}

export interface StartGameParams {
  target: number;
  seats: [string, string, string, string];
  firstDealer: number;
}

// Contrat que la couche data doit respecter (mock aujourd'hui, Supabase demain)
export interface DataApi {
  getProfiles(): Promise<Profile[]>;                     // joueurs acceptés uniquement
  getProfile(id: string): Promise<Profile | null>;
  getGames(): Promise<GameWithPlayers[]>;
  getGame(id: string): Promise<GameWithPlayers | null>;
  getEloHistory(profileId: string): Promise<EloPoint[]>;
  startGame(p: StartGameParams): Promise<string>;       // crée la partie « en cours »
  addRound(gameId: string, round: Round): Promise<void>;
  updateRound(gameId: string, index: number, round: Round): Promise<void>;
  deleteRound(gameId: string, index: number): Promise<void>;
  skipDealer(gameId: string): Promise<void>;             // personne ne prend : la donne passe au suivant
  finishGame(gameId: string): Promise<void>;             // en cours -> en attente de validation
  listJoinRequests(): Promise<JoinRequest[]>;           // admin
  decideJoinRequest(profileId: string, accept: boolean): Promise<void>; // admin
  confirmGame(gameId: string): Promise<void>;
  contestGame(gameId: string): Promise<void>;
  deleteGame(gameId: string): Promise<void>;
}
