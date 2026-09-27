/**
 * COUCHE SUPABASE — même contrat (DataApi) que mock.ts, via les tables (lecture, protégées par RLS)
 * et les fonctions SQL de supabase/schema.sql (écriture). Aucune écriture directe dans les tables.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import type { DataApi, EloPoint, Game, GamePlayer, GameWithPlayers, JoinRequest, Profile } from '../types';
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
    players: game_players.map(({ profiles, ...p }) => ({ ...p, display_name: profiles?.display_name ?? '?' })),
  };
}

export const supabaseApi: DataApi = {
  async getProfiles() {
    const { data, error } = await supabase().from('profiles').select('*')
      .eq('status', 'accepte').order('elo', { ascending: false });
    fail(error);
    return (data ?? []) as Profile[];
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

  async getEloHistory(profileId) {
    const { data, error } = await supabase().from('game_players')
      .select('game_id, elo_after, elo_delta, games(validated_at, created_at)')
      .eq('profile_id', profileId).not('elo_after', 'is', null);
    fail(error);
    type Row = { game_id: string; elo_after: number; elo_delta: number; games: { validated_at: string | null; created_at: string } | null };
    return ((data ?? []) as unknown as Row[])
      .map((r): EloPoint => ({
        game_id: r.game_id, elo_after: r.elo_after, elo_delta: r.elo_delta,
        date: r.games?.validated_at ?? r.games?.created_at ?? new Date(0).toISOString(),
      }))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  },

  startGame: ({ target, seats, firstDealer }) =>
    rpc<string>('start_game', { p_target: target, p_seats: seats, p_first_dealer: firstDealer }),
  addRound: (gameId, round) => rpc('add_round', { p_game_id: gameId, p_round: round }),
  updateRound: (gameId, index, round) => rpc('update_round', { p_game_id: gameId, p_index: index, p_round: round }),
  deleteRound: (gameId, index) => rpc('delete_round', { p_game_id: gameId, p_index: index }),
  skipDealer: gameId => rpc('skip_dealer', { p_game_id: gameId }),
  finishGame: gameId => rpc('finish_game', { p_game_id: gameId }),
  confirmGame: gameId => rpc('confirm_game', { p_game_id: gameId }),
  contestGame: gameId => rpc('contest_game', { p_game_id: gameId }),
  deleteGame: gameId => rpc('delete_game', { p_game_id: gameId }),

  async listJoinRequests() {
    const { data, error } = await supabase().rpc('list_join_requests');
    fail(error);
    return (data ?? []) as JoinRequest[];
  },
  decideJoinRequest: (profileId, accept) => rpc('decide_join_request', { p_id: profileId, p_accept: accept }),

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
  for (const table of ['games', 'game_players', 'profiles']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => notifyDbChange());
  }
  ch.subscribe();
}
