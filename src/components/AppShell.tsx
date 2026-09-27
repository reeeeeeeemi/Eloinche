'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { GroupProvider } from '@/lib/group';
import { SessionProvider, useSession } from '@/lib/session';
import { BottomNav } from './BottomNav';
import { PendingAccess } from './PendingAccess';

function Gate({ children }: { children: ReactNode }) {
  const { ready, uid, me } = useSession();
  const path = usePathname();
  const router = useRouter();
  const isLogin = path === '/login';
  // l'écran de jeu a sa propre barre du bas (Scores · + · Stats)
  const inGame = /^\/partie\/[^/]+$/.test(path);

  useEffect(() => {
    if (!ready) return;
    if ((!uid || !me) && !isLogin) router.replace('/login');
    else if (uid && me && isLogin) router.replace('/');
  }, [ready, uid, me, isLogin, router]);

  if (!ready) return null;
  if ((!uid || !me) && !isLogin) return null;
  // compte pas encore accepté par l'admin : il ne voit que l'écran d'attente
  if (me && me.status !== 'accepte' && !isLogin) return <PendingAccess />;
  return (
    <>
      {children}
      {!isLogin && !inGame && <BottomNav />}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <GroupProvider>
        <div className="app"><Gate>{children}</Gate></div>
      </GroupProvider>
    </SessionProvider>
  );
}
