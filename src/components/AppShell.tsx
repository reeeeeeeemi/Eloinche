'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { SessionProvider, useSession } from '@/lib/session';
import { BottomNav } from './BottomNav';

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
  }, [ready, uid, me, isLogin, router]);

  if (!ready) return null;
  if ((!uid || !me) && !isLogin) return null;
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
      <div className="app"><Gate>{children}</Gate></div>
    </SessionProvider>
  );
}
