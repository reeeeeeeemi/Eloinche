'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Radio, ShieldCheck, Trophy } from 'lucide-react';
import { DATA_SOURCE } from '@/lib/data';
import { mockAllProfiles, mockSignUp } from '@/lib/data/mock';
import { useSession } from '@/lib/session';
import { useData } from '@/lib/useData';

const FEATURES = [
  { Icon: Trophy, title: 'Un classement Elo par groupe', text: 'Un classement pour chaque bande de potes. Gagner large ou contre plus fort rapporte plus.' },
  { Icon: Radio, title: 'Les manches en direct', text: 'Saisies par n’importe quel joueur, visibles par les quatre.' },
  { Icon: ShieldCheck, title: 'Pas de triche', text: 'Chaque partie doit être confirmée par l’équipe adverse.' },
];

/** Page d'accueil publique : ce que voit un joueur avant de se connecter. */
export default function LoginPage() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-cards" aria-hidden>
          <span>♠</span><span className="red">♥</span><span>♣</span><span className="red">♦</span>
        </div>
        <h1>Eloinche</h1>
        <p>Le classement Elo de vos parties de coinche.</p>
      </section>

      <section className="landing-body">
        <ul className="landing-features">
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title}>
              <span className="landing-icon"><Icon size={22} /></span>
              <span><strong>{title}</strong><br /><span className="muted">{text}</span></span>
            </li>
          ))}
        </ul>
        {DATA_SOURCE === 'supabase' ? <AuthForm /> : <LocalLogin />}
      </section>
    </main>
  );
}

/** Connexion / création de compte (email + mot de passe). Ensuite : créer un groupe ou accepter une invitation. */
function AuthForm() {
  const router = useRouter();
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';
  const canSubmit = email.includes('@') && password.length >= 6 && (!signup || name.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (signup) await signUp(name, email, password); else await signIn(email, password);
      router.replace('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form className="card card-pad" style={{ margin: 0 }} onSubmit={submit}>
      <div className="chips" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" className={`chip ${!signup ? 'on' : ''}`} onClick={() => { setMode('login'); setErr(null); }}>Se connecter</button>
        <button type="button" role="tab" className={`chip ${signup ? 'on' : ''}`} onClick={() => { setMode('signup'); setErr(null); }}>Créer un compte</button>
      </div>
      {signup && (
        <label className="field"><span className="field-label">Prénom (affiché dans le classement, non modifiable)</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" placeholder="Ex. Thomas" />
        </label>
      )}
      <label className="field"><span className="field-label">Email</span>
        <input className="input" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="field"><span className="field-label">Mot de passe{signup ? ' (6 caractères minimum)' : ''}</span>
        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete={signup ? 'new-password' : 'current-password'} />
      </label>
      {err && <p className="error">{err}</p>}
      <button className="btn btn-primary btn-block" disabled={!canSubmit || busy}>
        {busy ? '…' : signup ? 'Créer mon compte' : 'Se connecter'}
      </button>
      <p className="small muted" style={{ textAlign: 'center', margin: '14px 0 0' }}>
        {signup ? 'Pour rejoindre le groupe de tes potes, crée ton compte avec l’email auquel ils t’ont invité.' : 'Tu restes connecté sur cet appareil tant que tu ne te déconnectes pas.'}
      </p>
    </form>
  );
}

/** MODE LOCAL : on choisit « qui on est » pour tester la validation sous plusieurs angles. */
function LocalLogin() {
  const router = useRouter();
  const { signInAs } = useSession();
  const { data: profiles } = useData(() => mockAllProfiles(), []);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const sorted = [...(profiles ?? [])].sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'));

  return (
    <div className="card card-pad" style={{ margin: 0 }}>
      <h2 className="section-title">Mode test <span className="mode-tag" style={{ marginLeft: 6 }}>local</span></h2>
      <p className="small muted" style={{ marginTop: -6 }}>
        Pas de connexion Google en local : choisis un joueur. Change d’utilisateur depuis le menu ⋮ pour jouer à sa place.
      </p>
      <div className="chips">
        {sorted.map(p => (
          <button key={p.id} className="chip" onClick={() => { signInAs(p.id); router.replace('/'); }}>
            {p.display_name}{p.is_admin && <span className="muted"> (admin)</span>}
            {p.status === 'en_attente' && <span className="muted"> (en attente)</span>}
            {p.status === 'refuse' && <span className="muted"> (refusé)</span>}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nouveau joueur" aria-label="Nom du nouveau joueur" />
        <button className="btn btn-soft" disabled={!name.trim()}
          onClick={async () => {
            try { await mockSignUp(name); router.replace('/'); }
            catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          }}>Créer</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
