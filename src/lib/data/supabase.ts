/**
 * COUCHE SUPABASE — même contrat (DataApi) que mock.ts, via les tables (lecture, protégées par RLS)
 * et les fonctions SQL de supabase/schema.sql (écriture). Aucune écriture directe dans les tables.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import type { DataApi, EloPoint, Game, GamePlayer, GameWithPlayers, Group, GroupInvite, MyInvite, Player, Profile } from '../types';
import { withGuests } from '../guests';
import { notifyDbChange } from './events';

/** Messages d'erreur SQL -> texte lisible (les exceptions de schema.sql sont déjà en français). */
function fail(error: PostgrestError | null): void {
  if (error) throw new Error(error.message);
}

async function rpc<T = void>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  fail(error);
  notifyDbChange();
  return data as T;
}

type GameRow = Game & { game_players: (GamePlayer & { profiles: { display_name: string } | null })[] };
const GAME_SELECT = '*, game_players(*, profiles(display_name))';

function toGame({ game_players, ...g }: GameRow): GameWithPlayers {
  return {
    ...g,
    players: withGuests(g, game_players.map(({ profiles, ...p }) => ({ ...p, display_name: profiles?.display_name ?? '?' }))),
  };
}

type MemberRow = Omit<Player, 'id' | 'display_name'> & { profile_id: string; profiles: { display_name: string } | null };

export const supabaseApi: DataApi = {
  async getGroups() {
    const { data, error } = await supabase().from('groups').select('*').order('created_at');
    fail(error);
    return (data ?? []) as Group[];
  },

  async getPlayers(groupId) {
    const { data, error } = await supabase().from('group_members').select('*, profiles(display_name)')
      .eq('group_id', groupId).order('elo', { ascending: false });
    fail(error);
    return ((data ?? []) as MemberRow[]).map(({ profile_id, profiles, ...m }): Player => ({
      id: profile_id, display_name: profiles?.display_name ?? '?',
      elo: m.elo, games_played: m.games_played, games_won: m.games_won, games_lost: m.games_lost, joined_at: m.joined_at,
    }));
  },

  async getProfile(id) {
    const { data, error } = await supabase().from('profiles').select('*').eq('id', id).maybeSingle();
    fail(error);
    return (data as Profile | null) ?? null;
  },

  async getGames() {
    const { data, error } = await supabase().from('games').select(GAME_SELECT).order('created_at', { ascending: false });
    fail(error);
    return ((data ?? []) as GameRow[]).map(toGame);
  },

  async getGame(id) {
    const { data, error } = await supabase().from('games').select(GAME_SELECT).eq('id', id).maybeSingle();
    fail(error);
    return data ? toGame(data as GameRow) : null;
  },

  async getEloHistory(groupId, profileId) {
    const { data, error } = await supabase().from('game_players')
      .select('game_id, elo_after, elo_delta, games!inner(validated_at, created_at, group_id)')
      .eq('profile_id', profileId).eq('games.group_id', groupId).not('elo_after', 'is', null);
    fail(error);
    type Row = { game_id: string; elo_after: number; elo_delta: number; games: { validated_at: string | null; created_at: string } | null };
    return ((data ?? []) as unknown as Row[])
      .map((r): EloPoint => ({
        game_id: r.game_id, elo_after: r.elo_after, elo_delta: r.elo_delta,
        date: r.games?.validated_at ?? r.games?.created_at ?? new Date(0).toISOString(),
      }))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  },

  startGame: ({ groupId, target, seats, firstDealer }) =>
    rpc<string>('start_game', { p_group: groupId, p_target: target, p_seats: seats, p_first_dealer: firstDealer }),
  startFriendlyGame: ({ target, names, firstDealer }) =>
    rpc<string>('start_friendly_game', { p_target: target, p_names: names, p_first_dealer: firstDealer }),
  addRound: (gameId, round) => rpc('add_round', { p_game_id: gameId, p_round: round }),
  updateRound: (gameId, index, round) => rpc('update_round', { p_game_id: gameId, p_index: index, p_round: round }),
  deleteRound: (gameId, index) => rpc('delete_round', { p_game_id: gameId, p_index: index }),
  skipDealer: gameId => rpc('skip_dealer', { p_game_id: gameId }),
  finishGame: gameId => rpc('finish_game', { p_game_id: gameId }),
  confirmGame: gameId => rpc('confirm_game', { p_game_id: gameId }),
  contestGame: gameId => rpc('contest_game', { p_game_id: gameId }),
  deleteGame: gameId => rpc('delete_game', { p_game_id: gameId }),

  createGroup: name => rpc<string>('create_group', { p_name: name }),
  inviteToGroup: (groupId, email) => rpc('invite_to_group', { p_group: groupId, p_email: email }),
  async getInvites(groupId) {
    const { data, error } = await supabase().from('group_invites').select('*')
      .eq('group_id', groupId).order('created_at', { ascending: false });
    fail(error);
    return (data ?? []) as GroupInvite[];
  },
  async getMyInvites() {
    const { data, error } = await supabase().rpc('my_invites');
    fail(error);
    return (data ?? []) as MyInvite[];
  },
  respondInvite: (inviteId, accept) => rpc('respond_invite', { p_invite: inviteId, p_accept: accept }),
  cancelInvite: inviteId => rpc('cancel_invite', { p_invite: inviteId }),
  removeMember: (groupId, profileId) => rpc('remove_member', { p_group: groupId, p_profile: profileId }),

  // pas de notifyDbChange : rien d'affiché ne dépend des abonnements
  async savePushSubscription({ endpoint, p256dh, auth }) {
    const { error } = await supabase().rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
    fail(error);
  },
  async deletePushSubscription(endpoint) {
    const { error } = await supabase().rpc('delete_push_subscription', { p_endpoint: endpoint });
    fail(error);
  },
};

/**
 * Temps réel : quand un autre joueur ajoute une manche, confirme une partie, ou quand l'admin
 * accepte un compte, tous les écrans ouverts se rechargent (les RLS filtrent ce qu'on reçoit).
 */
let subscribed = false;
export function subscribeRealtime() {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;
  const ch = supabase().channel('db-changes');
  for (const table of ['games', 'game_players', 'profiles', 'groups', 'group_members', 'group_invites']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => notifyDbChange());
  }
  ch.subscribe();
}
