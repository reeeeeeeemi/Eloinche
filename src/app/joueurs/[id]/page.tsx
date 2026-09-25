'use client';
import { useParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { PlayerView } from '@/components/PlayerView';
import { useSession } from '@/lib/session';

export default function JoueurPage() {
  const { id } = useParams<{ id: string }>();
  const { uid } = useSession();
  return (
    <>
      <Header back title="Joueur" />
      <main className="main"><PlayerView id={id} /></main>
    </>
  );
}
