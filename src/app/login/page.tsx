'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/data';
import { mockSignUp } from '@/lib/data/mock';
import { useSession } from '@/lib/session';
import { useData } from '@/lib/useData';

/**
 * MODE LOCAL : on choisit "qui on est" pour tester la validation sous plusieurs angles.
 * En prod, cette page deviendra : champ email -> magic link Supabase (comme HUB Events).
 */
export default function LoginPage() {
  const router = useRouter();
  const { signInAs } = useSession();
  const { data: profiles } = useData(() => api.getProfiles(), []);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const sorted = [...(profiles ?? [])].sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'));

  return (
    <main className="main" style={{ paddingTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 56 }} aria-hidden>🃏</div>
        <h1 style={{ margin: '8px 0 6px', fontSize: 30, letterSpacing: -0.5 }}>Coinche CDM</h1>
        <span className="mode-tag">Mode local</span>
      </div>

      <div className="card card-pad">
        <h2 className="section-title">Se connecter en tant que</h2>
        <p className="small muted" style={{ marginTop: -6 }}>
          En local, pas de mail : choisis un joueur. Change d’utilisateur depuis le menu ⋮ pour confirmer ou contester une partie à sa place.
        </p>
        <div className="chips">
          {sorted.map(p => (
            <button key={p.id} className="chip" onClick={() => { signInAs(p.id); router.replace('/'); }}>
              {p.display_name}
            </button>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="section-title">Nouveau joueur</h2>
        <label className="field">
          <span className="field-label">Nom affiché</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Kinan" />
        </label>
        {err && <p className="error">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={!name.trim()}
          onClick={async () => {
            try { await mockSignUp(name); router.replace('/'); }
            catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          }}>
          Créer le compte
        </button>
      </div>
    </main>
  );
}
