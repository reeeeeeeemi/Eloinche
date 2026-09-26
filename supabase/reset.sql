-- =====================================================================
--  RESET — efface TOUTES les données de l'appli (profils, parties, manches).
--  À n'utiliser qu'en phase de mise en place, avant d'avoir de vraies parties.
--  Ensuite : relancer schema.sql.
-- =====================================================================
drop trigger if exists on_auth_user_created on auth.users;

-- cascade : supprime aussi les fonctions qui dépendent de ces tables
drop table if exists game_players, games, profile_emails, allowed_emails, profiles cascade;

drop function if exists handle_new_user() cascade;
drop function if exists is_accepted() cascade;
drop function if exists is_admin() cascade;
drop function if exists require_accepted() cascade;
drop function if exists validate_game(uuid) cascade;
drop function if exists start_game(int, uuid[], int) cascade;
drop function if exists lock_ongoing_game(uuid) cascade;
drop function if exists set_rounds(uuid, jsonb) cascade;
drop function if exists add_round(uuid, jsonb) cascade;
drop function if exists update_round(uuid, int, jsonb) cascade;
drop function if exists delete_round(uuid, int) cascade;
drop function if exists skip_dealer(uuid) cascade;
drop function if exists finish_game(uuid) cascade;
drop function if exists confirm_game(uuid) cascade;
drop function if exists contest_game(uuid) cascade;
drop function if exists delete_game(uuid) cascade;
drop function if exists create_game(int, uuid[], uuid[], int, int, jsonb) cascade;
drop function if exists list_join_requests() cascade;
drop function if exists decide_join_request(uuid, boolean) cascade;
drop function if exists process_expired_games() cascade;

-- Comptes de connexion déjà créés (optionnel) : décommenter pour repartir de zéro,
-- sinon ces comptes n'auront pas de profil. Le 1er compte recréé redeviendra admin.
-- delete from auth.users;
