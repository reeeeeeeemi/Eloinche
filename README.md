# Coinche CDM — Elo

Next.js 16 (App Router) + TypeScript. En **mode local**, toutes les données viennent de
`src/data/coinche_data.json` puis vivent dans le localStorage du navigateur. Aucun backend.

## Lancer en local

```bash
npm install
cp .env.local.example .env.local
npm run dev
```
Puis ouvre http://localhost:3000. Pour tester sur ton téléphone (même Wi-Fi) :
`npm run dev -- -H 0.0.0.0` et ouvre http://IP-DE-TON-PC:3000.

## Cycle de vie d'une partie

Une **partie** = une suite de **manches** jusqu'à ce qu'une paire atteigne l'objectif.

1. **En cours** : créée dès le départ, les 4 joueurs la voient dans *Partie* et dans *Historique > Mes parties*,
   et chacun peut ajouter/supprimer des manches. On peut en avoir plusieurs en parallèle.
2. **En attente** : objectif atteint → *Enregistrer la partie*. 48 h pour confirmer ou contester.
3. **Validée** (Elo appliqué) → apparaît dans *Historique > Général*. Ou **Contestée** (ne compte pas).

## Tester la validation anti-triche

1. Connecte-toi en tant que **Rémi** : une partie contre Mike/Quentin est « En attente ».
2. Menu ⋮ > *Changer d'utilisateur* > **Yugs** (partenaire) : confirmer ne valide pas.
3. Change pour **Mike** (adversaire) : *Confirmer* → partie validée, Elo mis à jour.
4. Crée une partie en tant que Rémi, puis connecte-toi en tant qu'un adversaire et *Conteste*.
5. Menu ⋮ > *Réinitialiser les données de test* pour repartir du JSON.

## Structure

```
src/
  app/                    pages (classement, nouvelle, partie, historique, joueurs, profil, login)
  components/             Header, BottomNav, AjoutManche, GameCard, LineChart, PlayerView
  data/coinche_data.json  données de test (même forme que les tables Supabase)
  lib/
    types.ts              types = tables SQL + interface DataApi
    scoring.ts            règles de points (capot 250, générale 500, coinche ×2/×4, belote +20)
    elo.ts                Elo margin-based + répartition entre partenaires selon les prises (identique à validate_game en SQL)
    table.ts              places autour de la table, équipes, donneur
    data/index.ts         ← SEUL point d'entrée des données pour le front
    data/mock.ts          réplique des RPC SQL (start/add_round/delete_round/finish/confirm/contest/delete/validate + expiration 48h)
supabase/schema.sql       schéma à exécuter plus tard dans Supabase
```

## Passage à Supabase (plus tard)

1. Exécuter `supabase/schema.sql`, activer pg_cron et le magic link.
2. Créer `src/lib/data/supabase.ts` qui implémente `DataApi` avec des `supabase.rpc(...)`.
3. Dans `src/lib/data/index.ts`, choisir l'implémentation selon `NEXT_PUBLIC_DATA_SOURCE`.
4. Remplacer la page `/login` par le formulaire email → magic link.

Aucune page ni composant n'a besoin de changer.
