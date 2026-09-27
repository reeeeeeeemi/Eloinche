'use client';
import { useRouter } from 'next/navigation';
import { Hourglass, ShieldX } from 'lucide-react';
import { DATA_SOURCE } from '@/lib/data';
import { useSession } from '@/lib/session';

/** Écran d'un compte bloqué par l'admin (ou resté en attente d'une ancienne version) : il ne voit rien d'autre. */
export function PendingAccess() {
  const router = useRouter();
  const { me, signOut } = useSession();
  const refused = me?.status === 'refuse';
  return (
    <main className="main" style={{ display: 'grid', placeItems: 'center', minHeight: '80dvh', paddingBottom: 32 }}>
      <div className="card card-pad" style={{ textAlign: 'center', maxWidth: 360 }}>
        <span className="landing-icon" style={{ margin: '4px auto 14px' }}>
          {refused ? <ShieldX size={22} /> : <Hourglass size={22} />}
        </span>
        <h1 style={{ fontSize: 21, margin: '0 0 8px' }}>
          {refused ? 'Accès refusé' : `Bienvenue ${me?.display_name ?? ''} !`}
        </h1>
        <p className="muted" style={{ margin: '0 0 18px', lineHeight: 1.5 }}>
          {refused
            ? 'L’organisateur n’a pas validé ce compte. Si c’est une erreur, contacte-le.'
            : 'Ton compte est en attente : l’organisateur doit valider ton accès. Reviens un peu plus tard.'}
        </p>
        <button className="btn btn-outline btn-block" onClick={async () => { await signOut(); router.replace('/login'); }}>
          {DATA_SOURCE === 'mock' ? 'Changer d’utilisateur' : 'Se déconnecter'}
        </button>
      </div>
    </main>
  );
}
