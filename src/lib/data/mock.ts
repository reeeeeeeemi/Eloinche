/**
 * COUCHE MOCK — reproduit fidèlement les fonctions SQL (start_game, confirm_game, contest_game,
 * delete_game, validate_game, process_expired_games, groupes et invitations).
 * Données : src/data/coinche_data.json, puis persistées dans le localStorage du navigateur.
 * Utilisateur connecté (≈ auth.uid()) : simulé via localStorage aussi.
 */
import seed from '@/data/coinche_data.json';
import { BASE_ELO, bilanPrises, eloDeltas, splitTeamDelta } from '../elo';
import { withGuests } from '../guests';
import { isFinished, totals, winnerOf, withFaussesDonnes } from '../scoring';
import type {
  DataApi, EloPoint, Game, GamePlayer, GameWithPlayers, Group, GroupInvite, Profile, Round, StartGameParams, Team,
} from '../types';

/** Ligne de group_members (Elo et stats du joueur dans ce groupe). */
interface MemberRow {
  group_id: string; profile_id: string; elo: number;
  games_played: number; games_won: number; games_lost: number; joined_at: string;
}

interface MockDb {
  profiles: Profile[]; games: Game[]; game_players: GamePlayer[]; profile_emails: { id: string; email: string }[];
  groups: Group[]; group_members: MemberRow[]; group_invites: GroupInvite[];
}

const DB_KEY = 'coinche_mock_db_v5';
const UID_KEY = 'coinche_mock_uid';
import { DB_EVENT } from './events';
export { DB_EVENT };
const VALIDATION_DELAY_MS = 48 * 3600 * 1000;

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Décale les dates du seed pour que la partie la plus récente date d'il y a 3h
 *  (sinon la partie "en attente" serait déjà expirée et auto-validée au 1er chargement). */
function rebase(db: MockDb): MockDb {
  const latest = Math.max(...db.games.map(g => Date.parse(g.created_at)));
  if (!isFinite(latest)) return db;
  const offset = Date.now() - 3 * 3600 * 1000 - latest;
  const shift = (d: string | null) => (d ? new Date(Date.parse(d) + offset).toISOString() : d);
  db.games.forEach(g => {
    g.created_at = shift(g.created_at)!;
    g.validate_deadline = shift(g.validate_deadline)!;
    g.validated_at = shift(g.validated_at);
  });
  return db;
}

/** Email de test d'un joueur local : « Rémi » -> remi@exemple.fr */
export const mockEmail = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '.') + '@exemple.fr';

/** Données de test (src/data/coinche_data.json), dates recalées sur maintenant. */
function freshDb(): MockDb {
  const { profiles, profile_emails, groups, group_members, group_invites, games, game_players } = seed as unknown as MockDb;
  return rebase(clone({ profiles, profile_emails, groups, group_members, group_invites, games, game_players }));
}

function load(): MockDb {
  if (typeof window === 'undefined') return freshDb();
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch { /* ignore */ }
  const db = freshDb();
  persist(db, false);
  return db;
}

function persist(db: MockDb, notify = true) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* ignore */ }
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new Event(DB_EVENT));
}

/** Lecture + balayage des parties expirées (≈ pg_cron). */
function read(): MockDb {
  const db = load();
  const now = Date.now();
  const expired = db.games.filter(g => g.status === 'en_attente' && now > Date.parse(g.validate_deadline!));
  if (expired.length) {
    expired
      .sort((a, b) => Date.parse(a.validate_deadline!) - Date.parse(b.validate_deadline!))
      .forEach(g => validateGame(db, g.id));
    persist(db, false);
  }
  return db;
}

// ---------- session simulée ----------
/** Email de test d'un joueur local. */
export function mockEmailOf(uid: string): string | null {
  return load().profile_emails.find(e => e.id === uid)?.email ?? null;
}

export function getCurrentUid(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(UID_KEY);
}
export function setCurrentUid(uid: string | null) {
  if (uid) localStorage.setItem(UID_KEY, uid); else localStorage.removeItem(UID_KEY);
  window.dispatchEvent(new Event(DB_EVENT));
}
/** ≈ require_accepted() : connecté, compte non bloqué. */
function requireUid(): string {
  const uid = getCurrentUid();
  if (!uid) throw new Error('non authentifié');
  if (load().profiles.find(p => p.id === uid)?.status !== 'accepte') throw new Error('compte bloqué');
  return uid;
}
const isMember = (db: MockDb, groupId: string, uid: string) =>
  db.group_members.some(m => m.group_id === groupId && m.profile_id === uid);
const emailOf = (db: MockDb, uid: string) => db.profile_emails.find(e => e.id === uid)?.email;
const myGroups = (db: MockDb, uid: string | null) =>
  new Set(db.group_members.filter(m => m.profile_id === uid).map(m => m.group_id));

/** Simule l'inscription (connexion + trigger handle_new_user). */
export async function mockSignUp(displayName: string): Promise<string> {
  const name = displayName.trim();
  if (!name) throw new Error('Indique un nom');
  const db = read();
  if (db.profiles.some(p => p.display_name.toLowerCase() === name.toLowerCase()))
    throw new Error('Ce nom est déjà pris');
  const id = uuid();
  db.profiles.push({ id, display_name: name, created_at: new Date().toISOString(), status: 'accepte' });
  db.profile_emails.push({ id, email: mockEmail(name) });
  persist(db);
  setCurrentUid(id);
  return id;
}

/** Mode test : tous les comptes, y compris en attente / refusés (pour se connecter à leur place). */
export async function mockAllProfiles(): Promise<Profile[]> {
  return clone(read().profiles);
}

export function resetMockDb() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem('coinche_mock_db_v1');
  localStorage.removeItem('coinche_mock_db_v2');
  localStorage.removeItem('coinche_mock_db_v3');
  localStorage.removeItem('coinche_mock_db_v4');
  localStorage.removeItem('coinche_current_game');
  localStorage.removeItem('coinche_current_games');
  load();
  window.dispatchEvent(new Event(DB_EVENT));
}

// ---------- ≈ validate_game (jamais exposée au client en prod) ----------
function validateGame(db: MockDb, gameId: string) {
  const g = db.games.find(x => x.id === gameId);
  if (!g || (g.status !== 'en_attente' && g.status !== 'contestee')) return;
  const gp = db.game_players.filter(x => x.game_id === gameId);
  const prof = (id: string) => db.group_members.find(m => m.group_id === g.group_id && m.profile_id === id)!;
  const avg = (t: Team) => {
    const els = gp.filter(x => x.team === t).map(x => prof(x.profile_id).elo);
    return els.reduce((a, b) => a + b, 0) / els.length;
  };
  const d = eloDeltas(avg('A'), avg('B'), g.winner, g.score_a, g.score_b, g.target);
  // delta d'équipe réparti entre partenaires selon leur bilan de prises
  const individual = new Map<string, number>();
  (['A', 'B'] as Team[]).forEach(t => {
    const [p1, p2] = gp.filter(x => x.team === t).map(x => x.profile_id);
    const [d1, d2] = splitTeamDelta(d[t], bilanPrises(g.rounds, p1), bilanPrises(g.rounds, p2));
    individual.set(p1, d1).set(p2, d2);
  });
  gp.forEach(row => {
    const p = prof(row.profile_id);
    const delta = individual.get(row.profile_id)!;
    row.elo_before = p.elo;
    row.elo_delta = delta;
    row.elo_after = p.elo + delta;
    p.elo += delta;
    p.games_played += 1;
    if (row.team === g.winner) p.games_won += 1; else p.games_lost += 1;
  });
  g.status = 'validee';
  g.validated_at = new Date().toISOString();
}

function withPlayers(db: MockDb, g: Game): GameWithPlayers {
  return {
    ...g,
    players: withGuests(g, db.game_players
      .filter(x => x.game_id === g.id)
      .map(x => ({ ...x, display_name: db.profiles.find(p => p.id === x.profile_id)?.display_name ?? '?' }))),
  };
}

/** Parties visibles : celles de mes groupes, et mes parties amicales. */
const visible = (db: MockDb, g: Game, uid: string | null) =>
  g.group_id ? myGroups(db, uid).has(g.group_id) : g.created_by === uid;

/** Partie en cours dont l'utilisateur connecté est un des 4 joueurs. */
function ongoing(gameId: string) {
  const uid = requireUid();
  const db = read();
  const g = db.games.find(x => x.id === gameId);
  if (!g) throw new Error('partie introuvable');
  if (g.status !== 'en_cours') throw new Error('la partie n’est plus en cours');
  if (!db.game_players.some(x => x.game_id === gameId && x.profile_id === uid))
    throw new Error('tu ne participes pas à cette partie');
  return { db, g, uid };
}

function setRounds(g: Game, input: Round[]) {
  const rounds = withFaussesDonnes(input);
  const t = totals(rounds);
  g.rounds = rounds;
  g.score_a = t.A;
  g.score_b = t.B;
  g.winner = winnerOf(rounds, t.A, t.B);
}

/** Validation dès qu'un joueur de l'équipe adverse au créateur a confirmé. */
function validateIfOpponentConfirmed(db: MockDb, g: Game) {
  const gp = db.game_players.filter(x => x.game_id === g.id);
  if (g.status === 'contestee') {
    // contestée : validée malgré tout si les 3 autres joueurs confirment
    if (gp.every(x => x.profile_id === g.contested_by || x.confirmed)) validateGame(db, g.id);
    return;
  }
  const creatorTeam = gp.find(x => x.profile_id === g.created_by)!.team;
  if (gp.some(x => x.confirmed && x.team !== creatorTeam)) validateGame(db, g.id);
}

// ---------- API ----------
export const mockApi: DataApi = {
  async getProfile(id) {
    return clone(read().profiles.find(p => p.id === id) ?? null);
  },
  async getGroups() {
    const db = read();
    const mine = myGroups(db, getCurrentUid());
    return clone(db.groups.filter(g => mine.has(g.id)));
  },
  async getPlayers(groupId) {
    const db = read();
    if (!isMember(db, groupId, getCurrentUid() ?? '')) return [];
    return db.group_members.filter(m => m.group_id === groupId)
      .map(({ profile_id, group_id: _, ...m }) => ({
        ...m, id: profile_id, display_name: db.profiles.find(p => p.id === profile_id)?.display_name ?? '?',
      }))
      .sort((a, b) => b.elo - a.elo);
  },
  async getGames() {
    const db = read();
    const uid = getCurrentUid();
    return clone(db.games.filter(g => visible(db, g, uid)))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map(g => withPlayers(db, g));
  },
  async getGame(id) {
    const db = read();
    const g = db.games.find(x => x.id === id && visible(db, x, getCurrentUid()));
    return g ? clone(withPlayers(db, g)) : null;
  },
  async getEloHistory(groupId, profileId) {
    const db = read();
    const pts: EloPoint[] = [];
    db.game_players
      .filter(x => x.profile_id === profileId && x.elo_after != null)
      .forEach(x => {
        const g = db.games.find(gg => gg.id === x.game_id && gg.group_id === groupId);
        if (g) pts.push({ game_id: g.id, date: g.validated_at ?? g.created_at, elo_after: x.elo_after!, elo_delta: x.elo_delta! });
      });
    return pts.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  },

  // ≈ start_game : la partie existe dès la 1re manche, visible par les 4 joueurs
  async startGame({ groupId, target, seats, firstDealer }: StartGameParams) {
    const uid = requireUid();
    if (new Set(seats).size !== 4) throw new Error('un joueur est en double');
    if (seats[0] !== uid) throw new Error('le créateur doit participer à la partie');
    const db = read();
    if (!seats.every(id => isMember(db, groupId, id)))
      throw new Error('les 4 joueurs doivent faire partie du groupe');
    const id = uuid();
    db.games.push({
      id, group_id: groupId, created_by: uid, created_at: new Date().toISOString(), target,
      score_a: 0, score_b: 0, winner: 'A', rounds: [], status: 'en_cours',
      validate_deadline: null, validated_at: null, seats, first_dealer: firstDealer,
    });
    seats.forEach((pid, i) => db.game_players.push({
      game_id: id, profile_id: pid, team: i % 2 === 0 ? 'A' : 'B', confirmed: false,
      elo_before: null, elo_delta: null, elo_after: null,
    }));
    persist(db);
    return id;
  },

  // ≈ start_friendly_game : le créateur + 3 invités sans compte
  async startFriendlyGame({ target, names, firstDealer }) {
    const uid = requireUid();
    const clean = names.map(n => n.trim());
    if (clean.some(n => n.length < 1 || n.length > 30)) throw new Error('il faut le prénom des 3 autres joueurs');
    const db = read();
    const id = uuid();
    const seats = [uid, uuid(), uuid(), uuid()] as [string, string, string, string];
    db.games.push({
      id, group_id: null, created_by: uid, created_at: new Date().toISOString(), target,
      score_a: 0, score_b: 0, winner: 'A', rounds: [], status: 'en_cours',
      validate_deadline: null, validated_at: null, seats, first_dealer: firstDealer,
      guest_names: { [seats[1]]: clean[0], [seats[2]]: clean[1], [seats[3]]: clean[2] },
    });
    db.game_players.push({ game_id: id, profile_id: uid, team: 'A', confirmed: true, elo_before: null, elo_delta: null, elo_after: null });
    persist(db);
    return id;
  },

  // ≈ add_round
  async addRound(gameId, round) {
    const { db, g } = ongoing(gameId);
    if (isFinished(g)) throw new Error('la partie est déjà terminée');
    setRounds(g, [...g.rounds, round]);
    persist(db);
  },

  // ≈ update_round
  async updateRound(gameId, index, round) {
    const { db, g } = ongoing(gameId);
    if (index < 0 || index >= g.rounds.length) throw new Error('manche introuvable');
    setRounds(g, g.rounds.map((r, i) => (i === index ? round : r)));
    persist(db);
  },

  // ≈ delete_round
  async deleteRound(gameId, index) {
    const { db, g } = ongoing(gameId);
    setRounds(g, g.rounds.filter((_, i) => i !== index));
    persist(db);
  },

  // ≈ skip_dealer : personne n'a pris, on redistribue avec le donneur suivant
  async skipDealer(gameId) {
    const { db, g } = ongoing(gameId);
    g.dealer_skips = (g.dealer_skips ?? 0) + 1;
    persist(db);
  },

  // ≈ finish_game : en cours -> en attente de validation (48 h)
  async finishGame(gameId) {
    const { db, g, uid } = ongoing(gameId);
    if (!isFinished(g)) throw new Error('la partie n’est pas terminée');
    if (!g.group_id) {   // partie amicale : enregistrée telle quelle, sans validation ni Elo
      g.status = 'validee';
      g.validated_at = new Date().toISOString();
      persist(db);
      return;
    }
    g.status = 'en_attente';
    g.validate_deadline = new Date(Date.now() + VALIDATION_DELAY_MS).toISOString();
    db.game_players.filter(x => x.game_id === gameId && (x.profile_id === uid || x.profile_id === g.created_by))
      .forEach(x => { x.confirmed = true; });
    validateIfOpponentConfirmed(db, g);
    persist(db);
  },

  // ≈ confirm_game : un adversaire du créateur confirme -> validation immédiate.
  // Sur une partie contestée : validation quand les 3 autres joueurs que le contestataire ont confirmé.
  async confirmGame(gameId) {
    const uid = requireUid();
    const db = read();
    const g = db.games.find(x => x.id === gameId);
    if (!g) throw new Error('partie introuvable');
    if (g.status !== 'en_attente' && g.status !== 'contestee') throw new Error('partie non modifiable');
    if (g.contested_by === uid) throw new Error('tu as contesté cette partie');
    const me = db.game_players.find(x => x.game_id === gameId && x.profile_id === uid);
    if (!me) throw new Error('tu ne participes pas à cette partie');
    me.confirmed = true;
    validateIfOpponentConfirmed(db, g);
    persist(db);
  },

  // ≈ contest_game
  async contestGame(gameId) {
    const uid = requireUid();
    const db = read();
    const g = db.games.find(x => x.id === gameId);
    if (!g) throw new Error('partie introuvable');
    if (!db.game_players.some(x => x.game_id === gameId && x.profile_id === uid))
      throw new Error('tu ne participes pas à cette partie');
    if (!isFinished(g))
      throw new Error('une partie ne peut être contestée qu’une fois terminée');
    if (g.status === 'en_attente') { g.status = 'contestee'; g.contested_by = uid; }
    persist(db);
  },

  // ≈ delete_game
  async deleteGame(gameId) {
    const uid = requireUid();
    const db = read();
    const g = db.games.find(x => x.id === gameId);
    if (!g) throw new Error('partie introuvable');
    if (g.created_by !== uid) throw new Error('seul le créateur peut supprimer ou abandonner');
    if (g.status === 'validee' && g.group_id) throw new Error('une partie validée ne peut pas être supprimée');
    db.games = db.games.filter(x => x.id !== gameId);
    db.game_players = db.game_players.filter(x => x.game_id !== gameId);
    persist(db);
  },

  // Mode local : pas de serveur pour envoyer les notifications
  async savePushSubscription() {},
  async deletePushSubscription() {},

  // ≈ create_group
  async createGroup(name) {
    const uid = requireUid();
    const n = name.trim();
    if (n.length < 1 || n.length > 40) throw new Error('nom de groupe invalide (40 caractères max)');
    const db = read();
    const now = new Date().toISOString();
    const id = uuid();
    db.groups.push({ id, name: n, created_by: uid, created_at: now });
    db.group_members.push({ group_id: id, profile_id: uid, elo: BASE_ELO, games_played: 0, games_won: 0, games_lost: 0, joined_at: now });
    persist(db);
    return id;
  },

  // ≈ invite_to_group
  async inviteToGroup(groupId, email) {
    const uid = requireUid();
    const db = read();
    if (!isMember(db, groupId, uid)) throw new Error('tu ne fais pas partie de ce groupe');
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('adresse email invalide');
    const to = db.profile_emails.find(x => x.email === e)?.id;
    if (to && isMember(db, groupId, to)) throw new Error('ce joueur fait déjà partie du groupe');
    if (!db.group_invites.some(i => i.group_id === groupId && i.email === e))
      db.group_invites.push({ id: uuid(), group_id: groupId, email: e, invited_by: uid, created_at: new Date().toISOString() });
    persist(db);
  },

  async getInvites(groupId) {
    const db = read();
    if (!isMember(db, groupId, getCurrentUid() ?? '')) return [];
    return clone(db.group_invites.filter(i => i.group_id === groupId));
  },

  // ≈ my_invites
  async getMyInvites() {
    const db = read();
    const me = emailOf(db, getCurrentUid() ?? '');
    return db.group_invites.filter(i => i.email === me).map(i => ({
      id: i.id, group_id: i.group_id, created_at: i.created_at,
      group_name: db.groups.find(g => g.id === i.group_id)?.name ?? '?',
      invited_by_name: db.profiles.find(p => p.id === i.invited_by)?.display_name ?? '?',
    }));
  },

  // ≈ respond_invite
  async respondInvite(inviteId, accept) {
    const uid = requireUid();
    const db = read();
    const i = db.group_invites.find(x => x.id === inviteId && x.email === emailOf(db, uid));
    if (!i) throw new Error('invitation introuvable');
    if (accept && !isMember(db, i.group_id, uid))
      db.group_members.push({ group_id: i.group_id, profile_id: uid, elo: BASE_ELO, games_played: 0, games_won: 0, games_lost: 0, joined_at: new Date().toISOString() });
    db.group_invites = db.group_invites.filter(x => x.id !== inviteId);
    persist(db);
  },

  // ≈ cancel_invite
  async cancelInvite(inviteId) {
    const uid = requireUid();
    const db = read();
    db.group_invites = db.group_invites.filter(x => !(x.id === inviteId && isMember(db, x.group_id, uid)));
    persist(db);
  },

  // ≈ remove_member
  async removeMember(groupId, profileId) {
    const uid = requireUid();
    const db = read();
    const g = db.groups.find(x => x.id === groupId);
    if (!g) throw new Error('groupe introuvable');
    if (profileId === g.created_by) throw new Error('le créateur ne peut pas quitter son groupe');
    if (profileId !== uid && uid !== g.created_by) throw new Error('seul le créateur peut retirer un membre');
    if (db.games.some(x => x.group_id === groupId && x.status !== 'validee'
      && db.game_players.some(gp => gp.game_id === x.id && gp.profile_id === profileId)))
      throw new Error('ce joueur a une partie en cours ou à valider dans ce groupe');
    db.group_members = db.group_members.filter(m => !(m.group_id === groupId && m.profile_id === profileId));
    persist(db);
  },
};
