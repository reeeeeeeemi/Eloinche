'use client';
import Link from 'next/link';
import { ChevronRight, Users } from 'lucide-react';
import { Header } from '@/components/Header';
import { Invitations } from '@/components/Invitations';
import { Notifications } from '@/components/Notifications';
import { PlayerView } from '@/components/PlayerView';
import { useGroup } from '@/lib/group';
import { useSession } from '@/lib/session';

export default function ProfilPage() {
  const { uid } = useSession();
  const { groups } = useGroup();
  return (
    <>
      <Header title="Mon profil" />
      <main className="main">
        <Invitations />
        {uid && <PlayerView id={uid} />}
        <Link href="/groupes" className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users size={20} />
          <span style={{ flex: 1 }}>
            <strong>Mes groupes</strong>
            <span className="small muted" style={{ display: 'block' }}>
              {groups?.map(g => g.name).join(', ') || 'Aucun groupe'} · créer, inviter
            </span>
          </span>
          <ChevronRight size={20} className="muted" />
        </Link>
        {uid && <Notifications />}
      </main>
    </>
  );
}
