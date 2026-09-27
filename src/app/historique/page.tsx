'use client';
import { useState } from 'react';
import { GameCard } from '@/components/GameCard';
import { Header } from '@/components/Header';
import { api } from '@/lib/data';
import { useGroup } from '@/lib/group';
import { useSession } from '@/lib/session';
import { useData } from '@/lib/useData';
import { awaitsMe } from '@/lib/validation';

type Filter = 'general' | 'a_valider' | 'miennes';
/** Onglet de groupe : tous, un groupe (son id), ou les parties amicales. */
const ALL = 'tous', FRIENDLY = 'amicales';

export default function HistoriquePage() {
  const { uid } = useSession();
  const { groups } = useGroup();
  const { data: allGames, error } = useData(() => api.getGames(), []);
  const [scope, setScope] = useState<string>(ALL);
  const [filter, setFilter] = useState<Filter>('miennes');

  const hasFriendly = (allGames ?? []).some(g => !g.group_id);
  const inScope = (allGames ?? []).filter(g =>
    scope === ALL ? true : scope === FRIENDLY ? !g.group_id : g.group_id === scope);
  // nom du groupe sur chaque carte, seulement quand la liste mélange plusieurs groupes
  const groupName = (id: string | null) =>
    scope === ALL && (groups?.length ?? 0) > 1 && id ? groups?.find(g => g.id === id)?.name : undefined;

  const todo = inScope.filter(g => awaitsMe(g, uid));
  // Mes parties : tous statuts (en cours en tête). Général : uniquement les parties terminées et validées.
  const mine = inScope
    .filter(g => g.players.some(p => p.profile_id === uid))
    .sort((a, b) => Number(b.status === 'en_cours') - Number(a.status === 'en_cours'));
  const list = filter === 'a_valider' ? todo
    : filter === 'miennes' ? mine
    : inScope.filter(g => g.status === 'validee');
  const tabs = [
    { id: ALL, label: 'Tous' },
    ...(groups ?? []).map(g => ({ id: g.id, label: g.name })),
    ...(hasFriendly ? [{ id: FRIENDLY, label: 'Amicales' }] : []),
  ];

  return (
    <>
      <Header title="Historique" />
      <main className="main">
        {/* onglets utiles seulement s'il y a plus d'une catégorie de parties */}
        {(groups?.length ?? 0) + Number(hasFriendly) > 1 ? (
          <div className="chips scope-tabs" role="tablist" aria-label="Groupe">
            {tabs.map(t => (
              <button key={t.id} role="tab" aria-selected={scope === t.id} className={`scope-tab ${scope === t.id ? 'on' : ''}`}
                onClick={() => setScope(t.id)}>{t.label}</button>
            ))}
          </div>
        ) : null}
        <div className="chips" style={{ marginTop: 4 }}>
          <button className={`chip ${filter === 'miennes' ? 'on' : ''}`} onClick={() => setFilter('miennes')}>Mes parties</button>
          <button className={`chip ${filter === 'a_valider' ? 'on' : ''}`} onClick={() => setFilter('a_valider')}>
            À valider{todo.length ? ` (${todo.length})` : ''}
          </button>
          <button className={`chip ${filter === 'general' ? 'on' : ''}`} onClick={() => setFilter('general')}>Général</button>
        </div>
        {error && <p className="error">{error}</p>}
        {allGames && list.length === 0 && (
          <div className="empty">{filter === 'a_valider' ? 'Rien à valider pour toi.' : 'Aucune partie pour l’instant.'}</div>
        )}
        {list.map(g => <GameCard key={g.id} g={g} uid={uid} groupName={groupName(g.group_id)} />)}
      </main>
    </>
  );
}
