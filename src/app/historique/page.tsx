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

export default function HistoriquePage() {
  const { uid } = useSession();
  const { groups, group } = useGroup();
  const { data: allGames, error } = useData(() => api.getGames(), []);
  const games = allGames?.filter(g => g.group_id === group?.id) ?? null;
  const groupName = (id: string | null) => ((groups?.length ?? 0) > 1 ? groups?.find(g => g.id === id)?.name : undefined);
  const [filter, setFilter] = useState<Filter>('miennes');

  const todo = (allGames ?? []).filter(g => awaitsMe(g, uid));
  // Mes parties : celles du groupe affiché et mes parties amicales, tous statuts (en cours en tête).
  // Général : uniquement les parties validées du groupe.
  const mine = (allGames ?? [])
    .filter(g => (g.group_id === group?.id || !g.group_id) && g.players.some(p => p.profile_id === uid))
    .sort((a, b) => Number(b.status === 'en_cours') - Number(a.status === 'en_cours'));
  const list = filter === 'a_valider' ? todo
    : filter === 'miennes' ? mine
    : (games ?? []).filter(g => g.status === 'validee');

  return (
    <>
      <Header title="Historique" />
      <main className="main">
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
        {filter !== 'a_valider' && group && (groups?.length ?? 0) > 1 && (
          <p className="small muted" style={{ margin: '4px 4px 0' }}>Groupe {group.name}</p>
        )}
        {list.map(g => <GameCard key={g.id} g={g} uid={uid} groupName={filter === 'a_valider' ? groupName(g.group_id) : undefined} />)}
      </main>
    </>
  );
}
