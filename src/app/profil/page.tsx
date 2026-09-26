'use client';
import { Header } from '@/components/Header';
import { JoinRequests } from '@/components/JoinRequests';
import { PlayerView } from '@/components/PlayerView';
import { useSession } from '@/lib/session';

export default function ProfilPage() {
  const { uid, me } = useSession();
  return (
    <>
      <Header title="Mon profil" />
      <main className="main">
        {me?.is_admin && <JoinRequests />}
        {uid && <PlayerView id={uid} />}
      </main>
    </>
  );
}
