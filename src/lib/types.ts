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

/** Compte d'un joueur. */
export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
  status: 'en_attente' | 'accepte' | 'refuse'; // 'refuse' : compte bloqué
  is_admin?: boolean;
}

/** Un joueur dans un groupe, avec son Elo et ses stats dans ce groupe. */
export interface Player {
  id: string;             // profile_id
  display_name: string;
  elo: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  joined_at: string;
}

export interface Group {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

/** Invitation envoyée (vue par les membres du groupe). */
export interface GroupInvite {
  id: string;
  group_id: string;
  email: string;
  invited_by: string;
  created_at: string;
}

/** Invitation reçue (vue par l'invité). */
export interface MyInvite {
  id: string;
  group_id: string;
  group_name: string;
  invited_by_name: string;
  created_at: string;
}

export interface Game {
  id: string;
  group_id: string | null;            // null : partie amicale (hors groupe, sans Elo ni validation)
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
  guest_names?: Record<string, string> | null; // partie amicale : prénom des invités, par id de place
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
  guest?: boolean;                    // invité sans compte (partie amicale)
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

export interface StartFriendlyParams {
  target: number;
  names: [string, string, string];    // prénoms : à gauche, partenaire, à droite
  firstDealer: number;
}

export interface StartGameParams {
  groupId: string;
  target: number;
  seats: [string, string, string, string];
  firstDealer: number;
}

/** Abonnement aux notifications push d'un appareil (PushSubscription sérialisé). */
export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Contrat que la couche data doit respecter (mock aujourd'hui, Supabase demain)
export interface DataApi {
  getProfile(id: string): Promise<Profile | null>;       // compte (session)
  getGroups(): Promise<Group[]>;                         // mes groupes
  getPlayers(groupId: string): Promise<Player[]>;        // membres du groupe, par Elo décroissant
  getGames(): Promise<GameWithPlayers[]>;                // parties de tous mes groupes
  getGame(id: string): Promise<GameWithPlayers | null>;
  getEloHistory(groupId: string, profileId: string): Promise<EloPoint[]>;
  startGame(p: StartGameParams): Promise<string>;       // crée la partie « en cours »
  startFriendlyGame(p: StartFriendlyParams): Promise<string>; // partie amicale, avec 3 invités
  addRound(gameId: string, round: Round): Promise<void>;
  updateRound(gameId: string, index: number, round: Round): Promise<void>;
  deleteRound(gameId: string, index: number): Promise<void>;
  skipDealer(gameId: string): Promise<void>;             // personne ne prend : la donne passe au suivant
  finishGame(gameId: string): Promise<void>;             // en cours -> en attente de validation
  confirmGame(gameId: string): Promise<void>;
  contestGame(gameId: string): Promise<void>;
  deleteGame(gameId: string): Promise<void>;
  savePushSubscription(sub: PushSub): Promise<void>;     // cet appareil reçoit les notifs du joueur connecté
  deletePushSubscription(endpoint: string): Promise<void>;
  createGroup(name: string): Promise<string>;
  inviteToGroup(groupId: string, email: string): Promise<void>;
  getInvites(groupId: string): Promise<GroupInvite[]>;  // invitations en cours du groupe
  getMyInvites(): Promise<MyInvite[]>;
  respondInvite(inviteId: string, accept: boolean): Promise<void>;
  cancelInvite(inviteId: string): Promise<void>;
  removeMember(groupId: string, profileId: string): Promise<void>; // retirer (créateur) ou quitter (soi)
}
