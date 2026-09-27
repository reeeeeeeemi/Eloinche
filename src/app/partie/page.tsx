'use client';
import Link from 'next/link';
import { GameCard } from '@/components/GameCard';
import { Header } from '@/components/Header';
import { api } from '@/lib/data';
import { useGroup } from '@/lib/group';
import { useSession } from '@/lib/session';
import { useData } from '@/lib/useData';

/** Parties en cours dont je suis un des 4 joueurs (y compris celles lancées par un autre). */
export default function PartiesEnCoursPage() {
  const { uid } = useSession();
  const { groups } = useGroup();
  const groupName = (id: string | null) => ((groups?.length ?? 0) > 1 ? groups?.find(g => g.id === id)?.name : undefined);
  const { data: games } = useData(() => api.getGames(), []);
  const mine = (games ?? []).filter(g => g.status === 'en_cours' && g.players.some(p => p.profile_id === uid));

  return (
    <>
      <Header title="Parties en cours" />
      <main className="main">
        {games && mine.length === 0 && <div className="empty">Aucune partie en cours.</div>}
        {mine.map(g => <GameCard key={g.id} g={g} uid={uid} groupName={groupName(g.group_id)} />)}
        <Link href="/nouvelle" className="btn btn-primary btn-block" style={{ display: 'grid', placeItems: 'center', marginTop: 18 }}>
          Nouvelle partie
        </Link>
      </main>
    </>
  );
}
