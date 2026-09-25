'use client';
import Link from 'next/link';
import { useState } from 'react';
import { EloEvolution } from '@/components/EloEvolution';
import { Header } from '@/components/Header';
import { api } from '@/lib/data';
import { useSession } from '@/lib/session';
import { useData } from '@/lib/useData';

export default function ClassementPage() {
  const { uid } = useSession();
  const { data: profiles, error } = useData(() => api.getProfiles(), []);
  const { data: games } = useData(() => api.getGames(), []);
  const [view, setView] = useState<'tableau' | 'evolution'>('tableau');

  const ranked = (profiles ?? []).filter(p => p.games_played > 0);
  const unranked = (profiles ?? []).filter(p => p.games_played === 0);

  return (
    <>
      <Header title="Classement" />
      <main className="main">
        {error && <p className="error">{error}</p>}
        <div className="chips" style={{ marginTop: 4 }} role="tablist">
          <button role="tab" className={`chip ${view === 'tableau' ? 'on' : ''}`} onClick={() => setView('tableau')}>Tableau</button>
          <button role="tab" className={`chip ${view === 'evolution' ? 'on' : ''}`} onClick={() => setView('evolution')}>Évolution</button>
        </div>

        {view === 'evolution' && profiles && games && (
          <div className="card card-pad">
            <EloEvolution games={games} profiles={profiles} uid={uid} />
          </div>
        )}

        {view === 'tableau' && <>
        <div className="card">
          {ranked.length === 0 && profiles && (
            <div className="empty">Personne n’est encore classé. La première partie validée lance le classement.</div>
          )}
          {ranked.map((p, i) => (
            <Link key={p.id} href={`/joueurs/${p.id}`} className={`lb-row ${p.id === uid ? 'me' : ''}`}>
              <span className={`lb-rank ${i < 3 ? 'podium' : ''}`}>{i + 1}</span>
              <span>
                <div className="lb-name">{p.display_name}</div>
                <div className="lb-sub">
                  {p.games_played} partie{p.games_played > 1 ? 's' : ''}, {Math.round((p.games_won / p.games_played) * 100)} % de victoires
                </div>
              </span>
              <span className="lb-elo">{p.elo}</span>
            </Link>
          ))}
        </div>

        {unranked.length > 0 && (
          <>
            <h2 className="section-title" style={{ margin: '24px 4px 0', fontSize: 16 }}>Pas encore classés</h2>
            <div className="card">
              {unranked.map(p => (
                <Link key={p.id} href={`/joueurs/${p.id}`} className={`lb-row ${p.id === uid ? 'me' : ''}`}>
                  <span className="lb-rank">–</span>
                  <span className="lb-name" style={{ fontWeight: 500 }}>{p.display_name}</span>
                  <span className="lb-elo muted" style={{ fontSize: 17 }}>{p.elo}</span>
                </Link>
              ))}
            </div>
          </>
        )}
        </>}
        <p className="small muted" style={{ margin: '8px 4px' }}>
          Tout le monde démarre à 1000. Seules les parties validées comptent. Gagner large rapporte plus, surtout contre plus fort que soi (jusqu’à deux fois plus qu’une victoire serrée).
        </p>
      </main>
    </>
  );
}
