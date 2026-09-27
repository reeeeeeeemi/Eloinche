-- =====================================================================
--  COINCHE + ELO — schéma Supabase
--  À coller dans Supabase > SQL Editor, puis "Run". Relançable sans risque (met à niveau).
--  Prérequis : activer l'extension pg_cron (Database > Extensions).
--  Pour repartir d'une base vide pendant la mise en place : reset.sql, puis ce script.
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
  created_at    timestamptz not null default now(),
  -- accès validé par l'admin : en_attente -> accepte | refuse
  status        text not null default 'en_attente' check (status in ('en_attente','accepte','refuse')),
  is_admin      boolean not null default false
);

-- Mise à niveau d'une base créée avec une version précédente de ce script
alter table profiles add column if not exists status text not null default 'en_attente'
  check (status in ('en_attente','accepte','refuse'));
alter table profiles add column if not exists is_admin boolean not null default false;

-- Email de chaque compte, privé : lisible seulement par l'admin (via list_join_requests)
create table if not exists profile_emails (
  id     uuid primary key references profiles(id) on delete cascade,
  email  text not null
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

-- Mise à niveau d'une base créée avec une version précédente de ce script
alter table games add column if not exists seats        uuid[];
alter table games add column if not exists first_dealer int;
alter table games add column if not exists dealer_skips int not null default 0;
alter table games add column if not exists contested_by uuid references profiles(id);
alter table games alter column validate_deadline drop not null;
alter table games alter column score_a set default 0;
alter table games alter column score_b set default 0;
alter table games drop constraint if exists games_status_check;
alter table games add constraint games_status_check
  check (status in ('en_cours','en_attente','validee','contestee'));
drop table if exists allowed_emails;   -- ancienne liste d'emails autorisés (remplacée par la validation admin)

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

-- Groupes de potes : chaque groupe a son propre classement (Elo et stats par groupe).
-- On n'entre dans un groupe que sur invitation (par l'email du compte), acceptée par l'invité.
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 40),
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);

create table if not exists group_members (
  group_id      uuid not null references groups(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  elo           int  not null default 1000,
  games_played  int  not null default 0,
  games_won     int  not null default 0,
  games_lost    int  not null default 0,
  joined_at     timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table if not exists group_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  email       text not null,                       -- en minuscules
  invited_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  unique (group_id, email)
);

alter table games add column if not exists group_id uuid references groups(id) on delete cascade;  -- null : partie amicale
-- Partie amicale : les 3 autres joueurs sont des invités sans compte { id de place : prénom }
alter table games add column if not exists guest_names jsonb;

create index if not exists idx_games_status on games(status);
create index if not exists idx_games_group on games(group_id);
create index if not exists idx_gm_profile on group_members(profile_id);
create index if not exists idx_invites_email on group_invites(email);
create index if not exists idx_gp_profile on game_players(profile_id);
-- Deux joueurs ne peuvent pas porter le même nom (à la casse près)
create unique index if not exists uniq_profiles_name on profiles (lower(display_name));

-- Mise à niveau (une seule fois) : les joueurs et parties d'avant les groupes vont dans le groupe « CDM »,
-- avec leur Elo et leurs stats actuels. Les colonnes elo / games_* de profiles ne servent plus ensuite.
do $$
declare v_gid uuid; v_owner uuid;
begin
  if not exists (select 1 from groups) and exists (select 1 from profiles) then
    select id into v_owner from profiles order by is_admin desc, created_at limit 1;
    insert into groups(name, created_by) values ('CDM', v_owner) returning id into v_gid;
    insert into group_members(group_id, profile_id, elo, games_played, games_won, games_lost, joined_at)
      select v_gid, id, elo, games_played, games_won, games_lost, created_at from profiles where status = 'accepte';
    update games set group_id = v_gid where group_id is null;
  end if;
end $$;

-- Plus de validation des comptes par l'admin : l'accès aux groupes passe par les invitations.
alter table profiles alter column status set default 'accepte';
update profiles set status = 'accepte' where status = 'en_attente';

-- ---------------------------------------------------------------------
-- 2) INSCRIPTION
-- ---------------------------------------------------------------------
-- N'importe qui peut se connecter avec Google, mais son compte reste « en_attente » (il ne voit
-- et ne peut rien faire) tant que l'admin ne l'a pas accepté. 1 personne = 1 compte : l'admin
-- refuse les doublons. Le TOUT PREMIER compte créé devient admin, accepté d'office.
-- Nom affiché = prénom saisi à l'inscription, ou prénom du compte Google (nom complet si déjà pris).
-- Non modifiable ensuite.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_full  text := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''),  -- saisi à l'inscription
                           nullif(trim(new.raw_user_meta_data->>'full_name'), ''),      -- compte Google
                           nullif(trim(new.raw_user_meta_data->>'name'), ''),
                           split_part(new.email, '@', 1));
  v_name  text := split_part(v_full, ' ', 1);
  v_first boolean := not exists (select 1 from public.profiles);
begin
  if exists (select 1 from public.profiles where lower(display_name) = lower(v_name)) then
    v_name := v_full;
  end if;
  insert into public.profiles(id, display_name, status, is_admin)
  values (new.id, v_name, 'accepte', v_first);
  insert into public.profile_emails(id, email) values (new.id, lower(new.email));
  return new;
end $$;

-- Le joueur connecté est-il accepté / admin ? (utilisé par les RLS et les fonctions)
create or replace function is_accepted()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'accepte');
$$;
create or replace function is_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'accepte' and is_admin);
$$;
create or replace function require_accepted()
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'non authentifié'; end if;
  if not is_accepted() then raise exception 'compte en attente de validation'; end if;
end $$;

-- Le joueur connecté est-il membre du groupe ? Partage-t-il un groupe avec ce joueur ? (RLS et fonctions)
create or replace function is_member(p_group uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (select 1 from group_members where group_id = p_group and profile_id = auth.uid());
$$;
create or replace function shares_group(p_profile uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (select 1 from group_members a join group_members b on b.group_id = a.group_id
                  where a.profile_id = auth.uid() and b.profile_id = p_profile);
$$;
create or replace function my_email()
returns text language sql stable security definer set search_path=public,pg_temp as $$
  select email from profile_emails where id = auth.uid();
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- 2 bis) NOTIFICATIONS PUSH
--    La base envoie (via pg_net) les notifications à /api/push sur Vercel, qui les pousse aux appareils.
--    Rien n'est envoyé tant que app_settings n'est pas rempli (voir README) : l'appli marche sans.
-- ---------------------------------------------------------------------
create extension if not exists pg_net;

-- Un appareil abonné (le même joueur peut en avoir plusieurs : téléphone, ordi…)
create table if not exists push_subscriptions (
  endpoint    text primary key,
  profile_id  uuid not null references profiles(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
alter table push_subscriptions enable row level security;   -- aucune policy : accès via les fonctions seulement

-- Réglages privés (adresse de /api/push et secret partagé avec Vercel). RLS sans policy : illisible via l'API.
create table if not exists app_settings (
  key    text primary key,
  value  text not null
);
alter table app_settings enable row level security;

create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_accepted();
  insert into push_subscriptions(endpoint, profile_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set profile_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function delete_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
end $$;

-- Appelée par /api/push (avec le secret) pour oublier les appareils désabonnés
create or replace function forget_push_subscriptions(p_secret text, p_endpoints text[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_secret is null or p_secret is distinct from (select value from app_settings where key = 'push_secret') then
    raise exception 'interdit';
  end if;
  delete from push_subscriptions where endpoint = any(p_endpoints);
end $$;

-- Envoie une notification à tous les appareils de ces joueurs. Ne fait jamais échouer l'action en cours.
-- (pg_net n'envoie la requête qu'une fois la transaction validée.)
create or replace function send_push(p_profiles uuid[], p_title text, p_body text, p_url text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_url text; v_secret text; v_subs jsonb;
begin
  select value into v_url    from app_settings where key = 'push_url';
  select value into v_secret from app_settings where key = 'push_secret';
  if v_url is null or v_secret is null then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)))
    into v_subs from push_subscriptions where profile_id = any(p_profiles);
  if v_subs is null then return; end if;
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('subscriptions', v_subs, 'title', p_title, 'body', p_body, 'url', p_url),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000);
exception when others then
  raise warning 'send_push : %', sqlerrm;
end $$;

-- 1 -> « 1er », 3 -> « 3e »
create or replace function ordinal(n int)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case when n = 1 then '1er' else n || 'e' end
$$;

-- « Rémi/Yugs 2010 – 1500 Mike/Quentin »
create or replace function game_label(p_game_id uuid)
returns text language sql stable security definer set search_path=public,pg_temp as $$
  select (select string_agg(p.display_name, '/' order by p.display_name)
            from game_players gp join profiles p on p.id = gp.profile_id
           where gp.game_id = g.id and gp.team = 'A')
         || ' ' || g.score_a || ' – ' || g.score_b || ' ' ||
         (select string_agg(p.display_name, '/' order by p.display_name)
            from game_players gp join profiles p on p.id = gp.profile_id
           where gp.game_id = g.id and gp.team = 'B')
    from games g where g.id = p_game_id
$$;

-- Prévient ceux dont la confirmation est attendue : les adversaires du créateur (partie en attente),
-- ou les 3 autres joueurs (partie contestée).
create or replace function notify_to_validate(p_game_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g games; v_creator_team char(1); v_ids uuid[]; v_who text;
begin
  select * into g from games where id = p_game_id;
  if g.status = 'en_attente' then
    select team into v_creator_team from game_players where game_id = p_game_id and profile_id = g.created_by;
    select array_agg(profile_id) into v_ids from game_players
     where game_id = p_game_id and team <> v_creator_team and not confirmed;
    select display_name into v_who from profiles where id = g.created_by;
    perform send_push(v_ids, 'Partie à valider',
      v_who || ' a enregistré ' || game_label(p_game_id) || '. Confirme ou conteste.', '/historique/' || p_game_id);
  elsif g.status = 'contestee' then
    select array_agg(profile_id) into v_ids from game_players
     where game_id = p_game_id and profile_id <> g.contested_by and not confirmed;
    select display_name into v_who from profiles where id = g.contested_by;
    perform send_push(v_ids, 'Partie contestée',
      v_who || ' conteste ' || game_label(p_game_id) || '. Elle compte quand même si les 3 autres confirment.',
      '/historique/' || p_game_id);
  end if;
end $$;

-- Après validation : les 4 joueurs reçoivent le résultat (et leur nouvelle place),
-- les autres joueurs classés sont prévenus s'ils gagnent ou perdent des places.
-- p_before : { profile_id: rang } avant la partie.
create or replace function notify_validated(p_game_id uuid, p_before jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r record; v_label text := game_label(p_game_id); v_winner char(1); v_group uuid; v_gname text;
  v_gap int; v_places text; v_move text;
begin
  select g.winner, g.group_id, gr.name into v_winner, v_group, v_gname
    from games g join groups gr on gr.id = g.group_id where g.id = p_game_id;
  for r in
    select a.id, a.rk, (p_before->>a.id::text)::int as before_rk, gp.team, gp.elo_delta
      from (select profile_id as id, rank() over (order by elo desc)::int as rk
              from group_members where group_id = v_group and games_played > 0) a
      left join game_players gp on gp.profile_id = a.id and gp.game_id = p_game_id
  loop
    v_gap    := abs(coalesce(r.before_rk, r.rk) - r.rk);
    v_places := v_gap || case when v_gap > 1 then ' places' else ' place' end;
    v_move   := case when r.before_rk is null then 'Tu entres au classement : ' || ordinal(r.rk) || '.'
                     when r.rk < r.before_rk then 'Tu passes ' || ordinal(r.rk) || ' (+' || v_places || ').'
                     when r.rk > r.before_rk then 'Tu passes ' || ordinal(r.rk) || ' (−' || v_places || ').'
                end;
    if r.team is not null then
      perform send_push(array[r.id],
        case when r.team = v_winner then 'Victoire validée : ' else 'Défaite validée : ' end
          || case when r.elo_delta > 0 then '+' || r.elo_delta when r.elo_delta < 0 then '−' || abs(r.elo_delta) else '0' end
          || ' Elo',
        v_label || '.' || coalesce(' ' || v_move, ''), '/historique/' || p_game_id);
    elsif r.before_rk is not null and r.rk <> r.before_rk then
      perform send_push(array[r.id],
        case when r.rk < r.before_rk then 'Tu gagnes ' else 'Tu perds ' end || v_places,
        'Tu es maintenant ' || ordinal(r.rk) || ' du classement ' || v_gname || '.', '/?groupe=' || v_group);
    end if;
  end loop;
end $$;

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
  v_rank_before jsonb;
begin
  select * into g from games where id = p_game_id for update;
  if not found then raise exception 'partie introuvable'; end if;
  if g.status not in ('en_attente','contestee') then return; end if;   -- garde-fou : déjà traitée

  -- Elo moyen de chaque équipe (dans le groupe de la partie)
  select avg(m.elo) into ra
    from game_players gp join group_members m on m.profile_id = gp.profile_id and m.group_id = g.group_id
    where gp.game_id = p_game_id and gp.team = 'A';
  select avg(m.elo) into rb
    from game_players gp join group_members m on m.profile_id = gp.profile_id and m.group_id = g.group_id
    where gp.game_id = p_game_id and gp.team = 'B';

  ea := 1.0 / (1.0 + power(10, (rb - ra) / 400.0));

  -- Multiplicateur d'ampleur (margin-based) : 1x (serré) -> 2x (raclée)
  -- écart vu du vainqueur : 0 s'il gagne aux croix en étant derrière au score
  s_win  := case when g.winner = 'A' then g.score_a else g.score_b end;
  s_lose := case when g.winner = 'A' then g.score_b else g.score_a end;
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

  -- Historise avant/après par joueur (avant de toucher au classement du groupe)
  update game_players gp
     set elo_before = m.elo,
         elo_after  = m.elo + gp.elo_delta
    from group_members m
   where m.profile_id = gp.profile_id and m.group_id = g.group_id and gp.game_id = p_game_id;

  -- Classement du groupe avant la partie, pour prévenir ceux qui gagnent / perdent des places
  select coalesce(jsonb_object_agg(profile_id, rk), '{}'::jsonb) into v_rank_before
    from (select profile_id, rank() over (order by elo desc) as rk
            from group_members where group_id = g.group_id and games_played > 0) x;

  -- Applique au classement du groupe
  update group_members m
     set elo          = m.elo + gp.elo_delta,
         games_played = m.games_played + 1,
         games_won    = m.games_won  + (case when gp.team = g.winner then 1 else 0 end),
         games_lost   = m.games_lost + (case when gp.team = g.winner then 0 else 1 end)
    from game_players gp
   where gp.profile_id = m.profile_id and m.group_id = g.group_id and gp.game_id = p_game_id;

  update games set status = 'validee', validated_at = now() where id = p_game_id;
  perform notify_validated(p_game_id, v_rank_before);
end $$;

-- ---------------------------------------------------------------------
-- 4) FONCTIONS APPELABLES PAR LE CLIENT (RPC)
-- ---------------------------------------------------------------------

-- Démarrer une partie (statut en_cours). Le créateur occupe la place 0.
-- Équipe A = places 0 et 2, équipe B = places 1 et 3.
drop function if exists start_game(int, uuid[], int);   -- ancienne version, sans groupe
create or replace function start_game(p_group uuid, p_target int, p_seats uuid[], p_first_dealer int)
returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_game uuid;
begin
  perform require_accepted();
  if array_length(p_seats,1) <> 4 then raise exception 'il faut 4 joueurs'; end if;
  if (select count(*) from group_members where group_id = p_group and profile_id = any(p_seats)) <> 4 then
    raise exception 'les 4 joueurs doivent faire partie du groupe';
  end if;
  if (select count(distinct x) from unnest(p_seats) x) <> 4 then
    raise exception 'un joueur est en double';
  end if;
  if p_seats[1] <> v_uid then raise exception 'le créateur doit participer à la partie'; end if;
  if p_first_dealer not between 0 and 3 then raise exception 'donneur invalide'; end if;

  insert into games(group_id, created_by, target, status, seats, first_dealer)
  values (p_group, v_uid, p_target, 'en_cours', p_seats, p_first_dealer)
  returning id into v_game;

  insert into game_players(game_id, profile_id, team)
  select v_game, pid, case when i % 2 = 1 then 'A' else 'B' end
    from unnest(p_seats) with ordinality as t(pid, i);

  return v_game;
end $$;

-- Partie amicale (hors groupe) : le créateur et 3 invités sans compte, désignés par leur prénom.
-- Ne compte pour aucun Elo et n'a pas besoin d'être validée. p_names : [gauche, partenaire, droite].
create or replace function start_friendly_game(p_target int, p_names text[], p_first_dealer int)
returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_seats uuid[] := array[v_uid, gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_game uuid;
begin
  perform require_accepted();
  if array_length(p_names, 1) <> 3 or exists (select 1 from unnest(p_names) n where length(trim(coalesce(n, ''))) not between 1 and 30) then
    raise exception 'il faut le prénom des 3 autres joueurs';
  end if;
  if p_first_dealer not between 0 and 3 then raise exception 'donneur invalide'; end if;
  insert into games(group_id, created_by, target, status, seats, first_dealer, guest_names)
  values (null, v_uid, p_target, 'en_cours', v_seats, p_first_dealer,
          jsonb_build_object(v_seats[2]::text, trim(p_names[1]), v_seats[3]::text, trim(p_names[2]), v_seats[4]::text, trim(p_names[3])))
  returning id into v_game;
  insert into game_players(game_id, profile_id, team, confirmed) values (v_game, v_uid, 'A', true);
  return v_game;
end $$;

-- Garde commune : partie en cours + utilisateur parmi les 4 joueurs. Verrouille la ligne.
create or replace function lock_ongoing_game(p_game_id uuid)
returns games language plpgsql security definer set search_path=public,pg_temp as $$
declare g games;
begin
  perform require_accepted();
  select * into g from games where id = p_game_id for update;
  if not found then raise exception 'partie introuvable'; end if;
  if g.status <> 'en_cours' then raise exception 'la partie n''est plus en cours'; end if;
  if not exists (select 1 from game_players where game_id = p_game_id and profile_id = auth.uid()) then
    raise exception 'tu ne participes pas à cette partie';
  end if;
  return g;
end $$;

-- Capots non annoncés : une petite croix par capot pour la paire qui le fait ; la première à 3 croix perd.
-- Renvoie cette paire, ou null (identique à perdantCroix() dans src/lib/scoring.ts).
create or replace function perdant_croix(p_rounds jsonb)
returns char(1) language plpgsql immutable set search_path=public,pg_temp as $$
declare r jsonb; na int := 0; nb int := 0;
begin
  for r in select e from jsonb_array_elements(coalesce(p_rounds, '[]'::jsonb)) with ordinality as x(e, i) order by i loop
    if r->>'capot' = 'A' then na := na + 1; if na >= 3 then return 'A'; end if; end if;
    if r->>'capot' = 'B' then nb := nb + 1; if nb >= 3 then return 'B'; end if; end if;
  end loop;
  return null;
end $$;

-- Partie terminée : objectif atteint ou 3 croix (identique à isFinished() dans src/lib/scoring.ts).
create or replace function game_finished(g games)
returns boolean language sql immutable set search_path=public,pg_temp as $$
  select greatest(g.score_a, g.score_b) >= g.target or perdant_croix(g.rounds) is not null
$$;

-- Recalcule scores et vainqueur provisoire à partir des manches.
-- Fausses donnes : la 1re d'une paire ne coûte rien, à partir de la 2e chacune donne 160 à l'autre paire
-- (identique à withFaussesDonnes() dans src/lib/scoring.ts).
create or replace function set_rounds(p_game_id uuid, p_rounds jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r jsonb; v_out jsonb := '[]'::jsonb;
  na int := 0; nb int := 0; n int; pen int; t text;
  a int := 0; b int := 0; v_perdant char(1);
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
  v_perdant := perdant_croix(v_out);
  update games set rounds = v_out, score_a = a, score_b = b,
                   winner = case when v_perdant = 'A' then 'B' when v_perdant = 'B' then 'A'
                                 when a >= b then 'A' else 'B' end
   where id = p_game_id;
end $$;

-- Ajouter une manche (n'importe lequel des 4 joueurs).
create or replace function add_round(p_game_id uuid, p_round jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare g games := lock_ongoing_game(p_game_id);
begin
  if game_finished(g) then raise exception 'la partie est déjà terminée'; end if;
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
  if not game_finished(g) then
    raise exception 'la partie n''est pas terminée';
  end if;
  -- partie amicale : enregistrée telle quelle, sans validation ni Elo
  if g.group_id is null then
    update games set status = 'validee', validated_at = now() where id = p_game_id;
    return;
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
  perform notify_to_validate(p_game_id);   -- rien si elle vient d'être validée
end $$;

-- Confirmer une partie. Si un ADVERSAIRE du créateur confirme -> validation immédiate.
create or replace function confirm_game(p_game_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status text; v_creator uuid; v_contester uuid; v_creator_team char(1); v_opp boolean;
begin
  perform require_accepted();
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
  perform require_accepted();
  if not exists (select 1 from game_players where game_id = p_game_id and profile_id = v_uid) then
    raise exception 'tu ne participes pas à cette partie';
  end if;
  if exists (select 1 from games g where g.id = p_game_id and not game_finished(g)) then
    raise exception 'une partie ne peut être contestée qu''une fois terminée';
  end if;
  update games set status = 'contestee', contested_by = v_uid
   where id = p_game_id and status = 'en_attente';
  if found then perform notify_to_validate(p_game_id); end if;
end $$;

-- Supprimer / abandonner une partie (créateur seulement, tant qu'elle n'est pas validée).
create or replace function delete_game(p_game_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid := auth.uid(); v_status text; v_creator uuid; v_group uuid;
begin
  perform require_accepted();
  select status, created_by, group_id into v_status, v_creator, v_group from games where id = p_game_id;
  if not found then raise exception 'partie introuvable'; end if;
  if v_creator <> v_uid then raise exception 'seul le créateur peut supprimer'; end if;
  -- une partie amicale peut toujours être supprimée : elle ne compte pour aucun classement
  if v_status = 'validee' and v_group is not null then raise exception 'une partie validée ne peut pas être supprimée'; end if;
  delete from games where id = p_game_id;
end $$;

-- ---------- Groupes ----------

-- Créer un groupe : le créateur en est le premier membre.
create or replace function create_group(p_name text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  perform require_accepted();
  if length(trim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'nom de groupe invalide (40 caractères max)'; end if;
  insert into groups(name, created_by) values (trim(p_name), auth.uid()) returning id into v_id;
  insert into group_members(group_id, profile_id) values (v_id, auth.uid());
  return v_id;
end $$;

-- Inviter quelqu'un par l'email de son compte (n'importe quel membre). S'il n'a pas encore de compte,
-- l'invitation l'attend : il la verra dès qu'il s'inscrit avec cet email.
create or replace function invite_to_group(p_group uuid, p_email text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_email text := lower(trim(p_email)); v_to uuid; v_gname text; v_who text;
begin
  perform require_accepted();
  if not is_member(p_group) then raise exception 'tu ne fais pas partie de ce groupe'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'adresse email invalide'; end if;
  select id into v_to from profile_emails where email = v_email;
  if v_to is not null and exists (select 1 from group_members where group_id = p_group and profile_id = v_to) then
    raise exception 'ce joueur fait déjà partie du groupe';
  end if;
  insert into group_invites(group_id, email, invited_by) values (p_group, v_email, auth.uid())
  on conflict (group_id, email) do nothing;
  if found and v_to is not null then
    select name into v_gname from groups where id = p_group;
    select display_name into v_who from profiles where id = auth.uid();
    perform send_push(array[v_to], 'Invitation', v_who || ' t''invite dans le groupe ' || v_gname || '.', '/groupes');
  end if;
end $$;

-- Mes invitations en attente (avec le nom du groupe et de qui m'invite, que je ne peux pas encore lire).
create or replace function my_invites()
returns table (id uuid, group_id uuid, group_name text, invited_by_name text, created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select i.id, i.group_id, g.name, p.display_name, i.created_at
    from group_invites i join groups g on g.id = i.group_id join profiles p on p.id = i.invited_by
   where i.email = my_email()
   order by i.created_at desc;
$$;

-- Accepter ou refuser une invitation qui m'est adressée.
create or replace function respond_invite(p_invite uuid, p_accept boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare i group_invites;
begin
  perform require_accepted();
  select * into i from group_invites where id = p_invite and email = my_email();
  if not found then raise exception 'invitation introuvable'; end if;
  if p_accept then
    insert into group_members(group_id, profile_id) values (i.group_id, auth.uid()) on conflict do nothing;
  end if;
  delete from group_invites where id = p_invite;
end $$;

-- Annuler une invitation envoyée (n'importe quel membre du groupe).
create or replace function cancel_invite(p_invite uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_accepted();
  delete from group_invites where id = p_invite and is_member(group_id);
end $$;

-- Retirer un membre (créateur du groupe seulement), ou quitter le groupe soi-même.
-- Le créateur ne peut pas partir. Impossible tant que le joueur a une partie non validée dans le groupe.
create or replace function remove_member(p_group uuid, p_profile uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid;
begin
  perform require_accepted();
  select created_by into v_owner from groups where id = p_group;
  if not found then raise exception 'groupe introuvable'; end if;
  if p_profile = v_owner then raise exception 'le créateur ne peut pas quitter son groupe'; end if;
  if p_profile <> auth.uid() and auth.uid() <> v_owner then raise exception 'seul le créateur peut retirer un membre'; end if;
  if exists (select 1 from games g join game_players gp on gp.game_id = g.id
              where g.group_id = p_group and gp.profile_id = p_profile
                and g.status in ('en_cours', 'en_attente', 'contestee')) then
    raise exception 'ce joueur a une partie en cours ou à valider dans ce groupe';
  end if;
  delete from group_members where group_id = p_group and profile_id = p_profile;
end $$;

-- ADMIN : demandes d'accès (comptes non acceptés), avec leur email.
create or replace function list_join_requests()
returns table (id uuid, display_name text, email text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not is_admin() then raise exception 'réservé à l''admin'; end if;
  return query
    select p.id, p.display_name, e.email, p.status, p.created_at
      from profiles p left join profile_emails e on e.id = p.id
     where p.status <> 'accepte'
     order by p.created_at desc;
end $$;

-- ADMIN : accepter ou refuser une demande (un refusé peut être accepté plus tard).
create or replace function decide_join_request(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not is_admin() then raise exception 'réservé à l''admin'; end if;
  update profiles set status = case when p_accept then 'accepte' else 'refuse' end
   where id = p_id and not is_admin;
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
-- ⚠ Supabase donne par défaut EXECUTE sur toute fonction à anon et authenticated :
-- un simple « revoke from public » ne suffit pas, il faut retirer ces rôles explicitement.
-- Fonctions internes : appelables uniquement depuis les autres fonctions (jamais via l'API).
revoke execute on function validate_game(uuid)          from public, anon, authenticated;
revoke execute on function process_expired_games()      from public, anon, authenticated;
revoke execute on function lock_ongoing_game(uuid)      from public, anon, authenticated;
revoke execute on function set_rounds(uuid,jsonb)       from public, anon, authenticated;
revoke execute on function perdant_croix(jsonb)         from public, anon, authenticated;
revoke execute on function game_finished(games)         from public, anon, authenticated;
revoke execute on function require_accepted()           from public, anon, authenticated;
revoke execute on function send_push(uuid[],text,text,text)   from public, anon, authenticated;
revoke execute on function notify_to_validate(uuid)           from public, anon, authenticated;
revoke execute on function notify_validated(uuid,jsonb)       from public, anon, authenticated;
revoke execute on function game_label(uuid)                   from public, anon, authenticated;
revoke execute on function ordinal(int)                       from public, anon, authenticated;
-- /api/push appelle sans session (clé publique) : le secret est vérifié dans la fonction
grant  execute on function forget_push_subscriptions(text,text[]) to anon, authenticated;
revoke execute on function handle_new_user()            from public, anon, authenticated;

-- Fonctions de l'appli : joueurs connectés uniquement (chacune vérifie en plus que le compte est accepté)
do $$
declare f text;
begin
  foreach f in array array[
    'start_game(uuid,int,uuid[],int)', 'start_friendly_game(int,text[],int)', 'add_round(uuid,jsonb)', 'update_round(uuid,int,jsonb)',
    'delete_round(uuid,int)', 'skip_dealer(uuid)', 'finish_game(uuid)', 'confirm_game(uuid)',
    'contest_game(uuid)', 'delete_game(uuid)', 'list_join_requests()', 'decide_join_request(uuid,boolean)',
    'save_push_subscription(text,text,text)', 'delete_push_subscription(text)',
    'create_group(text)', 'invite_to_group(uuid,text)', 'my_invites()', 'respond_invite(uuid,boolean)',
    'cancel_invite(uuid)', 'remove_member(uuid,uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

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
-- On ne voit que sa fiche et celles des joueurs de ses groupes
create policy "profiles_read"   on profiles for select to authenticated
  using (id = auth.uid() or shares_group(id));

-- Emails : RLS sans aucune policy -> illisibles via l'API (seulement via list_join_requests)
alter table profile_emails enable row level security;

-- Parties et groupes : lecture pour les membres du groupe ; aucune écriture directe (tout passe par RPC)
alter table groups        enable row level security;
alter table group_members enable row level security;
alter table group_invites enable row level security;
grant select on games, game_players, groups, group_members, group_invites to authenticated;

drop policy if exists "games_read"   on games;
drop policy if exists "gp_read"      on game_players;
drop policy if exists "groups_read"  on groups;
drop policy if exists "gm_read"      on group_members;
drop policy if exists "invites_read" on group_invites;
-- partie amicale (sans groupe) : visible de son seul créateur
create policy "games_read"   on games         for select to authenticated
  using (is_member(group_id) or (group_id is null and created_by = auth.uid()));
create policy "gp_read"      on game_players  for select to authenticated
  using (exists (select 1 from games g where g.id = game_id
                  and (is_member(g.group_id) or (g.group_id is null and g.created_by = auth.uid()))));
create policy "groups_read"  on groups        for select to authenticated using (is_member(id));
create policy "gm_read"      on group_members for select to authenticated using (is_member(group_id));
-- les membres voient les invitations en cours du groupe, l'invité voit les siennes
create policy "invites_read" on group_invites for select to authenticated
  using (is_member(group_id) or email = my_email());

-- ---------------------------------------------------------------------
-- 7) TEMPS RÉEL — les écrans ouverts se mettent à jour quand un autre joueur agit
--    (les RLS ci-dessus filtrent ce que chacun reçoit)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['games', 'game_players', 'profiles', 'groups', 'group_members', 'group_invites'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object or undefined_object then null;  -- déjà ajoutée / hors Supabase
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8) CRON — auto-validation toutes les heures
--    (activer pg_cron dans Database > Extensions AVANT de lancer ceci)
-- ---------------------------------------------------------------------
-- À lancer UNE fois, après avoir activé pg_cron :
-- select cron.schedule('valider-parties-expirees', '0 * * * *',
--   $$ select process_expired_games(); $$);
