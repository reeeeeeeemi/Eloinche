'use client';
import { Bell, BellOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushConfigured, pushState, type PushState } from '@/lib/push';

const HINT: Record<PushState, string> = {
  unsupported: 'Ce navigateur ne gère pas les notifications.',
  install: 'Sur iPhone, ajoute d’abord l’appli à l’écran d’accueil (Safari : Partager → « Sur l’écran d’accueil »), puis ouvre-la depuis l’icône.',
  denied: 'Les notifications sont bloquées : autorise-les pour Coinche dans les réglages du téléphone.',
  off: 'Parties à valider, parties validées et changements de place au classement.',
  on: 'Tu es prévenu des parties à valider, des parties validées et de tes changements de place au classement.',
};

/** Activer / couper les notifications push sur cet appareil. */
export function Notifications() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (pushConfigured) pushState().then(setState).catch(() => setState('unsupported')); }, []);
  if (!state) return null;

  async function toggle() {
    setBusy(true); setErr(null);
    try {
      if (state === 'on') { await disablePush(); setState('off'); }
      else setState(await enablePush());
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="card card-pad">
      <h2 className="section-title" style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        {state === 'on' ? <Bell size={18} /> : <BellOff size={18} />} Notifications
      </h2>
      <p className="small muted" style={{ margin: '0 0 12px' }}>{HINT[state]}</p>
      {(state === 'on' || state === 'off') && (
        <button className={`btn btn-block ${state === 'on' ? 'btn-outline' : 'btn-primary'}`} disabled={busy} onClick={toggle}>
          {state === 'on' ? 'Couper les notifications' : 'Activer les notifications'}
        </button>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
