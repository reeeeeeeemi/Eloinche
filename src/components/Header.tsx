'use client';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ArrowLeft, MoreVertical, X } from 'lucide-react';
import { resetMockDb } from '@/lib/data/mock';
import { DATA_SOURCE } from '@/lib/data';
import { useSession } from '@/lib/session';

interface Props {
  title: ReactNode;
  back?: boolean | 'close';
  onBack?: () => void;
  right?: ReactNode;
  /** Boutons ajoutés à gauche du menu ⋮. */
  extra?: ReactNode;
  /** Titre aligné à gauche (écran de jeu). */
  alignLeft?: boolean;
}

export function Header({ title, back, onBack, right, extra, alignLeft }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { me, email, signOut } = useSession();
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try { await navigator.clipboard.writeText(email!); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* presse-papiers refusé : l'email reste sélectionnable */ }
  }

  return (
    <header className={`header ${alignLeft ? 'left' : ''}`}>
      <div>
        {back && (
          <button className="icon-btn" aria-label={back === 'close' ? 'Fermer' : 'Retour'}
            onClick={onBack ?? (() => router.back())}>
            {back === 'close' ? <X size={26} /> : <ArrowLeft size={24} />}
          </button>
        )}
      </div>
      <h1>{title}</h1>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
        {extra}
        {right ?? (
          <button className="icon-btn" aria-label="Menu" onClick={() => setOpen(o => !o)}>
            <MoreVertical size={22} />
          </button>
        )}
        {open && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setOpen(false)} />
            <div className="menu" role="menu">
              <div style={{ padding: '10px 14px 6px' }}>
                <div style={{ fontWeight: 600 }}>{me?.display_name}</div>
                {email && <div className="small muted menu-email">{email}</div>}
                {DATA_SOURCE === 'mock' && <span className="mode-tag">Mode local</span>}
              </div>
              {email && (
                <button onClick={copyEmail}>{copied ? 'Email copié' : 'Copier mon email'}</button>
              )}
              <div className="sep" />
              <button onClick={async () => { setOpen(false); await signOut(); router.push('/login'); }}>
                {DATA_SOURCE === 'mock' ? 'Changer d’utilisateur' : 'Se déconnecter'}
              </button>
              {DATA_SOURCE === 'mock' && (
                <button onClick={() => {
                  setOpen(false);
                  if (confirm('Remettre les données de test à zéro ? Les parties ajoutées seront perdues.')) resetMockDb();
                }}>
                  Réinitialiser les données de test
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
