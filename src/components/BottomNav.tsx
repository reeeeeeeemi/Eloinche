'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { History, Plus, Trophy, User } from 'lucide-react';
import { api } from '@/lib/data';
import { useGroup } from '@/lib/group';
import { useSession } from '@/lib/session';
import { useData } from '@/lib/useData';
import { awaitsMe } from '@/lib/validation';

export function BottomNav() {
  const path = usePathname();
  const { uid } = useSession();
  const { invites } = useGroup();
  const { data: games } = useData(() => api.getGames(), []);
  const toValidate = (games ?? []).filter(g => awaitsMe(g, uid)).length;
  const requests = invites?.length ?? 0;

  const items = [
    { href: '/', label: 'Classement', Icon: Trophy, match: (p: string) => p === '/' || p.startsWith('/joueurs') },
    { href: '/partie', label: 'Partie', Icon: Plus, match: (p: string) => p.startsWith('/partie') || p.startsWith('/nouvelle') },
    { href: '/historique', label: 'Historique', Icon: History, match: (p: string) => p.startsWith('/historique'), badge: toValidate },
    { href: '/profil', label: 'Profil', Icon: User, match: (p: string) => p.startsWith('/profil') || p.startsWith('/groupes'), badge: requests },
  ];

  return (
    <nav className="nav" aria-label="Navigation principale">
      <div className="nav-inner">
        {items.map(({ href, label, Icon, match, badge }) => (
          <Link key={href} href={href} className={match(path) ? 'active' : ''}>
            <span className="pill"><Icon size={24} strokeWidth={2} /></span>
            {label}
            {!!badge && <span className="badge" aria-label={`${badge} en attente`}>{badge}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}
