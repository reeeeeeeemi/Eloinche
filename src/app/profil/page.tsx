'use client';
import { Header } from '@/components/Header';
import { PlayerView } from '@/components/PlayerView';
import { useSession } from '@/lib/session';

export default function ProfilPage() {
  const { uid } = useSession();
  return (
    <>
      <Header title="Mon profil" />
      <main className="main">{uid && <PlayerView id={uid} />}</main>
    </>
  );
}
