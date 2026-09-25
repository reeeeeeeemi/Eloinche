-- =====================================================================
--  COINCHE + ELO — schéma Supabase
--  À coller dans Supabase > SQL Editor, puis "Run".
--  Prérequis : activer l'extension pg_cron (Database > Extensions).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TABLES
-- ---------------------------------------------------------------------

-- Profil = un compte inscrit (adossé à auth.users)
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  elo           int  not null default 1000,
  games_played  int  not null default 0,
  games_won     int  not null default 0,
  games_lost    int  not null default 0,
  created_at    timestamptz not null default now()
);

-- Une partie (course aux points, ex. 2000).
-- Cycle de vie : en_cours (manches saisies au fil de l'eau, visible des 4 joueurs)
--   -> en_attente (objectif atteint, 48 h pour confirmer/contester) -> validee | contestee
create table if not exists games (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid not null references profiles(id),
  created_at        timestamptz not null default now(),
  target            int  not null,
  score_a           int  not null default 0,
  score_b           int  not null default 0,
  winner            char(1) not null default 'A' check (winner in ('A','B')),
  rounds            jsonb not null default '[]'::jsonb,  -- manches, pour l'affichage
  status            text not null default 'en_cours'
                    check (status in ('en_cours','en_attente','validee','contestee')),
  validate_deadline timestamptz,                        -- fixée à la fin de la partie (auto-validation)
  validated_at      timestamptz,
  seats             uuid[],                             -- [créateur, gauche, partenaire, droite]
  first_dealer      int,
  dealer_skips      int  not null default 0,            -- donnes passées (personne n'a pris)
  contested_by      uuid references profiles(id)        -- contestataire (validée si les 3 autres confirment)
);

-- Les 4 joueurs d'une partie
create table if not exists game_players (
  game_id     uuid not null references games(id) on delete cascade,
  profile_id  uuid not null references profiles(id),
  team        char(1) not null check (team in ('A','B')),
  confirmed   boolean not null default false,
  elo_before  int,
  elo_delta   int,
  elo_after   int,
  primary key (game_id, profile_id)
);

create index if not exists idx_games_status on games(status);
create index if not exists idx_gp_profile on game_players(profile_id);
-- Deux joueurs ne peuvent pas porter le même nom (à la casse près)
create unique index if not exists uniq_profiles_name on profiles (lower(display_name));

-- ---------------------------------------------------------------------
-- 2) CRÉATION AUTO DU PROFIL À L'INSCRIPTION
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- 3) VALIDATION + ELO (margin-based) — cœur serveur
--    Jamais appelable directement par un utilisateur.
-- ---------------------------------------------------------------------
create or replace function validate_game(p_game_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g       record;
  ra numeric; rb numeric; ea numeric;
  s_win int; s_lose int; frac numeric; mult numeric; keff numeric; ew numeric;
  sa int; delta_a int; delta_b int;
  t char(1); pids uuid[]; b1 int; b2 int; d int; steps int; bonus int;
begin
  select * into g from games where id = p_game_id for update;
  if not found then raise exception 'partie introuvable'; end if;
  if g.status not in ('en_attente','contestee') then return; end if;   -- garde-fou : déjà traitée

  -- Elo moyen de chaque équipe
  select avg(p.elo) into ra
    from game_players gp join profiles p on p.id = gp.profile_id
    where gp.game_id = p_game_id and gp.team = 'A';
  select avg(p.elo) into rb
    from game_players gp join profiles p on p.id = gp.profile_id
    where gp.game_id = p_game_id and gp.team = 'B';

  ea := 1.0 / (1.0 + power(10, (rb - ra) / 400.0));

  -- Multiplicateur d'ampleur (margin-based) : 1x (serré) -> 2x (raclée)
  s_win  := greatest(g.score_a, g.score_b);
  s_lose := least(g.score_a, g.score_b);
  frac   := least(1.0, greatest(0.0, (s_win - s_lose)::numeric / nullif(g.target, 0)));
  sa := case when g.winner = 'A' then 1 else 0 end;
  -- bonus d'écart pondéré par la surprise : ×1 à égalité, moins pour un favori, plus pour un outsider
  ew     := case when sa = 1 then ea else 1 - ea end;   -- score attendu du vainqueur
  mult   := least(2.0, 1.0 + frac * 2 * (1 - ew));
  keff   := 32 * mult;

  delta_a := round(keff * (sa       - ea));
  delta_b := round(keff * ((1 - sa) - (1 - ea)));

  -- Répartit le delta d'équipe entre partenaires selon leur bilan de prises
  -- (réussies − chutées) : 4 % du delta par prise d'écart, plafonné à 20 %.
  -- Identique à splitTeamDelta() dans src/lib/elo.ts.
  foreach t in array array['A','B']::char(1)[] loop
    select array_agg(profile_id) into pids from game_players where game_id = p_game_id and team = t;
    select coalesce(sum(case when coalesce((r->>'reussi')::boolean,
                                           (r->>'points_preneur')::int >= (r->>'contrat')::int)
                             then 1 else -1 end), 0) into b1
      from jsonb_array_elements(g.rounds) r where r->>'preneur_id' = pids[1]::text;
    select coalesce(sum(case when coalesce((r->>'reussi')::boolean,
                                           (r->>'points_preneur')::int >= (r->>'contrat')::int)
                             then 1 else -1 end), 0) into b2
      from jsonb_array_elements(g.rounds) r where r->>'preneur_id' = pids[2]::text;
    d     := case when t = 'A' then delta_a else delta_b end;
    steps := greatest(-5, least(5, b1 - b2));
    bonus := sign(steps) * round(abs(d) * abs(steps) * 4 / 100.0);
    update game_players set elo_delta = d + bonus where game_id = p_game_id and profile_id = pids[1];
    update game_players set elo_delta = d - bonus where game_id = p_game_id and profile_id = pids[2];
  end loop;

  -- Historise avant/après par joueur (avant de toucher aux profils)
  update game_players gp
     set elo_before = p.elo,
         elo_after  = p.elo + gp.elo_delta
    from profiles p
   where gp.profile_id = p.id and gp.game_id = p_game_id;

  -- Applique aux profils
  update profiles p
     set elo          = p.elo + gp.elo_delta,
         games_played = p.games_played + 1,
         games_won    = p.games_won  + (case when gp.team = g.winner then 1 else 0 end),
         games_lost   = p.games_lost + (case when gp.team = g.winner then 0 else 1 end)
    from game_players gp
   where gp.profile_id = p.id and gp.game_id = p_game_id;

  update games set status = 'validee', validated_at = now() where id = p_game_id;
end $$;

-- ---------------------------------------------------------------------
-- 4) FONCTIONS APPELABLES PAR LE CLIENT (RPC)
-- ---------------------------------------------------------------------

-- Démarrer une partie (statut en_cours). Le créateur occupe la place 0.
-- Équipe A = places 0 et 2, équipe B = places 1 et 3.
create or replace function start_game(p_target int, p_seats uuid[], p_first_dealer int)
returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_game uuid;
begin
  if v_uid is null then raise exception 'non authentifié'; end if;
  if array_length(p_seats,1) <> 4 then raise exception 'il faut 4 joueurs'; end if;
  if (select count(distinct x) from unnest(p_seats) x) <> 4 then
    raise exception 'un joueur est en double';
  end if;
  if p_seats[1] <> v_uid then raise exception 'le créateur doit participer à la partie'; end if;
  if p_first_dealer not between 0 and 3 then raise exception 'donneur invalide'; end if;

  insert into games(created_by, target, status, seats, first_dealer)
  values (v_uid, p_target, 'en_cours', p_seats, p_first_dealer)
  returning id into v_game;

  insert into game_players(game_id, profile_id, team)
  select v_game, pid, case when i % 2 = 1 then 'A' else 'B' end
    from unnest(p_seats) with ordinality as t(pid, i);

  return v_game;
end $$;

-- Garde commune : partie en cours + utilisateur parmi les 4 joueurs. Verrouille la ligne.
create or replace function lock_ongoing_game(p_game_id uuid)
returns games language plpgsql security definer set search_path=public,pg_temp as $$
declare g games;
begin
  if auth.uid() is null then raise exception 'non authentifié'; end if;
  select * into g from games where id = p_game_id for update;
  if not found then raise exception 'partie introuvable'; end if;
  if g.status <> 'en_cours' then raise exception 'la partie n''est plus en cours'; end if;
  if not exists (select 1 from game_players where game_id = p_game_id and profile_id = auth.uid()) then
    raise exception 'tu ne participes pas à cette partie';
  end if;
  return g;
end $$;

-- Recalcule scores et vainqueur provisoire à partir des manches.
-- Fausses donnes : la 1re d'une paire ne coûte rien, à partir de la 2e chacune donne 160 à l'autre paire
-- (identique à withFaussesDonnes() dans src/lib/scoring.ts).
create or replace function set_rounds(p_game_id uuid, p_rounds jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r jsonb; v_out jsonb := '[]'::jsonb;
  na int := 0; nb int := 0; n int; pen int; t text;
  a int := 0; b int := 0;
begin
  for r in select e from jsonb_array_elements(p_rounds) with ordinality as x(e, i) order by i loop
    t := r->>'fausse_donne';
    if t in ('A','B') then
      if t = 'A' then na := na + 1; n := na; else nb := nb + 1; n := nb; end if;
      pen := case when n >= 2 then 160 else 0 end;
      r := r || jsonb_build_object('score_a', case when t = 'B' then pen else 0 end,
                                   'score_b', case when t = 'A' then pen else 0 end);
    end if;
    a := a + (r->>'score_a')::int;
    b := b + (r->>'score_b')::int;
    v_out := v_out || jsonb_build_array(r);
  end loop;
  update games set rounds = v_out, score_a = a, score_b = b,
                   winner = case when a >= b then 'A' else 'B' end
   where id = p_game_id;
end $$;

-- Ajouter une manche (n'importe lequel des 4 joueurs).
create or replace function add_round(p_game_id uuid, p_round jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g games := lock_ongoing_game(p_game_id);
begin
  if greatest(g.score_a, g.score_b) >= g.target then raise exception 'la partie est déjà terminée'; end if;
  perform set_rounds(p_game_id, g.rounds || jsonb_build_array(p_round));
end $$;

-- Modifier une manche (index 0-based).
create or replace function update_round(p_game_id uuid, p_index int, p_round jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g games := lock_ongoing_game(p_game_id);
begin
  if p_index < 0 or p_index >= jsonb_array_length(g.rounds) then raise exception 'manche introuvable'; end if;
  perform set_rounds(p_game_id, jsonb_set(g.rounds, array[p_index::text], p_round));
end $$;

-- Supprimer une manche (index 0-based).
create or replace function delete_round(p_game_id uuid, p_index int)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g games := lock_ongoing_game(p_game_id);
begin
  perform set_rounds(p_game_id, g.rounds - p_index);
end $$;

-- Passer la donne : personne n'a pris, le donneur suivant redistribue.
create or replace function skip_dealer(p_game_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g games := lock_ongoing_game(p_game_id);
begin
  update games set dealer_skips = dealer_skips + 1 where id = p_game_id;
end $$;

-- Terminer la partie : objectif atteint -> en attente de validation (48 h).
-- Le créateur et celui qui termine sont confirmés ; si c'est un adversaire du créateur, validation immédiate.
create or replace function finish_game(p_game_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g games := lock_ongoing_game(p_game_id); v_creator_team char(1);
begin
  if greatest(g.score_a, g.score_b) < g.target then
    raise exception 'la partie n''est pas terminée';
  end if;
  update games set status = 'en_attente', validate_deadline = now() + interval '48 hours'
   where id = p_game_id;
  update game_players set confirmed = true
   where game_id = p_game_id and profile_id in (auth.uid(), g.created_by);

  select team into v_creator_team from game_players where game_id = p_game_id and profile_id = g.created_by;
  if exists (select 1 from game_players
              where game_id = p_game_id and confirmed and team <> v_creator_team) then
    perform validate_game(p_game_id);
  end if;
end $$;

-- Confirmer une partie. Si un ADVERSAIRE du créateur confirme -> validation immédiate.
create or replace function confirm_game(p_game_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status text; v_creator uuid; v_contester uuid; v_creator_team char(1); v_opp boolean;
begin
  if v_uid is null then raise exception 'non authentifié'; end if;
  select status, created_by, contested_by into v_status, v_creator, v_contester from games where id = p_game_id for update;
  if not found then raise exception 'partie introuvable'; end if;
  if v_status not in ('en_attente','contestee') then raise exception 'partie non modifiable'; end if;
  if v_contester = v_uid then raise exception 'tu as contesté cette partie'; end if;
  if not exists (select 1 from game_players where game_id = p_game_id and profile_id = v_uid) then
    raise exception 'tu ne participes pas à cette partie';
  end if;

  update game_players set confirmed = true where game_id = p_game_id and profile_id = v_uid;

  -- Contestée : validée malgré tout quand les 3 autres joueurs ont confirmé
  if v_status = 'contestee' then
    if not exists (select 1 from game_players
                    where game_id = p_game_id and profile_id <> v_contester and not confirmed) then
      perform validate_game(p_game_id);
    end if;
    return;
  end if;

  select team into v_creator_team from game_players where game_id = p_game_id and profile_id = v_creator;
  select exists (
    select 1 from game_players
     where game_id = p_game_id and confirmed = true and team <> v_creator_team
  ) into v_opp;

  if v_opp then perform validate_game(p_game_id); end if;
end $$;

-- Contester une partie -> ne compte pas, sauf si les 3 autres joueurs confirment ensuite.
create or replace function contest_game(p_game_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'non authentifié'; end if;
  if not exists (select 1 from game_players where game_id = p_game_id and profile_id = v_uid) then
    raise exception 'tu ne participes pas à cette partie';
  end if;
  if exists (select 1 from games where id = p_game_id and greatest(score_a, score_b) < target) then
    raise exception 'une partie ne peut être contestée qu''une fois terminée';
  end if;
  update games set status = 'contestee', contested_by = v_uid
   where id = p_game_id and status = 'en_attente';
end $$;

-- Supprimer / abandonner une partie (créateur seulement, tant qu'elle n'est pas validée).
create or replace function delete_game(p_game_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid := auth.uid(); v_status text; v_creator uuid;
begin
  select status, created_by into v_status, v_creator from games where id = p_game_id;
  if not found then raise exception 'partie introuvable'; end if;
  if v_creator <> v_uid then raise exception 'seul le créateur peut supprimer'; end if;
  if v_status = 'validee' then raise exception 'une partie validée ne peut pas être supprimée'; end if;
  delete from games where id = p_game_id;
end $$;

-- Balayage des parties expirées (appelé par pg_cron).
create or replace function process_expired_games()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;
begin
  for r in select id from games where status = 'en_attente' and now() > validate_deadline loop
    perform validate_game(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) DROITS D'EXÉCUTION
-- ---------------------------------------------------------------------
revoke execute on function validate_game(uuid)        from public;
revoke execute on function process_expired_games()    from public;
revoke execute on function lock_ongoing_game(uuid)   from public;
revoke execute on function set_rounds(uuid,jsonb)    from public;
grant  execute on function start_game(int,uuid[],int) to authenticated;
grant  execute on function add_round(uuid,jsonb)     to authenticated;
grant  execute on function update_round(uuid,int,jsonb) to authenticated;
grant  execute on function delete_round(uuid,int)    to authenticated;
grant  execute on function skip_dealer(uuid)         to authenticated;
grant  execute on function finish_game(uuid)         to authenticated;
grant  execute on function confirm_game(uuid)  to authenticated;
grant  execute on function contest_game(uuid)  to authenticated;
grant  execute on function delete_game(uuid)   to authenticated;

-- ---------------------------------------------------------------------
-- 6) RLS — lecture ouverte, écriture UNIQUEMENT via les fonctions ci-dessus
-- ---------------------------------------------------------------------
alter table profiles     enable row level security;
alter table games        enable row level security;
alter table game_players enable row level security;

-- Profils : tout le monde lit (classement) ; personne ne peut rien modifier, pas même son nom
-- (évite qu'un joueur se renomme pour faire porter ses défaites à un autre).
-- Le nom est fixé à l'inscription ; seul un admin peut le changer depuis le dashboard Supabase.
grant select on profiles to authenticated;
revoke update, insert, delete on profiles from authenticated;

drop policy if exists "profiles_read"   on profiles;
drop policy if exists "profiles_update" on profiles;
create policy "profiles_read"   on profiles for select to authenticated using (true);

-- Parties : lecture pour tous les inscrits ; aucune écriture directe (tout passe par RPC)
grant select on games, game_players to authenticated;

drop policy if exists "games_read" on games;
drop policy if exists "gp_read"    on game_players;
create policy "games_read" on games        for select to authenticated using (true);
create policy "gp_read"    on game_players  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 7) CRON — auto-validation toutes les heures
--    (activer pg_cron dans Database > Extensions AVANT de lancer ceci)
-- ---------------------------------------------------------------------
-- select cron.schedule('valider-parties-expirees', '0 * * * *',
--   $$ select process_expired_games(); $$);
