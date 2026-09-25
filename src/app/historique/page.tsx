'use client';
import { useState } from 'react';
import { GameCard } from '@/components/GameCard';
import { Header } from '@/components/Header';
import { api } from '@/lib/data';
import { useSession } from '@/lib/session';
import { useData } from '@/lib/useData';
import { awaitsMe } from '@/lib/validation';

type Filter = 'general' | 'a_valider' | 'miennes';

export default function HistoriquePage() {
  const { uid } = useSession();
  const { data: games, error } = useData(() => api.getGames(), []);
  const [filter, setFilter] = useState<Filter>('miennes');

  const todo = (games ?? []).filter(g => awaitsMe(g, uid));
  // Mes parties : tous statuts (en cours en tête). Général : uniquement les parties validées.
  const mine = (games ?? [])
    .filter(g => g.players.some(p => p.profile_id === uid))
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
        {games && list.length === 0 && (
          <div className="empty">{filter === 'a_valider' ? 'Rien à valider pour toi.' : 'Aucune partie pour l’instant.'}</div>
        )}
        {list.map(g => <GameCard key={g.id} g={g} uid={uid} />)}
      </main>
    </>
  );
}
