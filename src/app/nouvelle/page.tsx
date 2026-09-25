'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { api } from '@/lib/data';
import { useSession } from '@/lib/session';
import { useData } from '@/lib/useData';

const TARGETS = [1000, 1500, 2000, 3000];

export default function NouvellePage() {
  const router = useRouter();
  const { uid, me } = useSession();
  const { data: profiles } = useData(() => api.getProfiles(), []);
  const [step, setStep] = useState(1);
  const [seats, setSeats] = useState({ left: '', partner: '', right: '' });
  const [target, setTarget] = useState(2000);
  const [dealer, setDealer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const others = [...(profiles ?? [])]
    .filter(p => p.id !== uid)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'));
  const name = (id: string) => profiles?.find(p => p.id === id)?.display_name ?? '';
  const chosen = [seats.left, seats.partner, seats.right];
  const step1Ok = chosen.every(Boolean) && new Set(chosen).size === 3;
  // ordre autour de la table (sens horaire) : toi, gauche, partenaire, droite
  const order = uid ? [uid, seats.left, seats.partner, seats.right] as [string, string, string, string] : null;

  const select = (key: keyof typeof seats, placeholder: string) => (
    <select className="select" value={seats[key]} aria-label={placeholder}
      onChange={e => setSeats(s => ({ ...s, [key]: e.target.value }))}>
      <option value="">{placeholder}</option>
      {others.map(p => (
        <option key={p.id} value={p.id} disabled={chosen.includes(p.id) && seats[key] !== p.id}>{p.display_name}</option>
      ))}
    </select>
  );

  return (
    <>
      <Header title="Nouvelle partie" />
      <main className="main">
        <div className="card card-pad">
          <div className={`step ${step > 1 ? 'done' : ''}`}><span className="step-num">1</span>Joueurs</div>
          {step === 1 && (
            <div className="step-body" style={{ marginLeft: 0 }}>
              <div className="grid2">
                <label className="field"><span className="field-label">Toi</span>
                  <div className="input" style={{ display: 'flex', alignItems: 'center' }}>{me?.display_name}</div>
                </label>
                <label className="field"><span className="field-label">À ta gauche</span>{select('left', 'À ta gauche')}</label>
                <label className="field"><span className="field-label">Ton partenaire</span>{select('partner', 'Ton partenaire')}</label>
                <label className="field"><span className="field-label">À ta droite</span>{select('right', 'À ta droite')}</label>
              </div>
              <button className="btn btn-primary" disabled={!step1Ok} onClick={() => setStep(2)}>Suivant</button>
            </div>
          )}
          {step > 1 && (
            <p className="small muted step-body" style={{ marginTop: -8 }}>
              {me?.display_name} et {name(seats.partner)} contre {name(seats.left)} et {name(seats.right)}
              {' '}<button className="small" style={{ border: 'none', background: 'none', color: 'var(--teal)', padding: 0 }} onClick={() => setStep(1)}>modifier</button>
            </p>
          )}

          <div className={`step ${step > 2 ? 'done' : ''}`}><span className="step-num">2</span>Paramètres de la partie</div>
          {step === 2 && (
            <div className="step-body">
              <span className="field-label" style={{ marginLeft: 0 }}>Nombre de points à atteindre</span>
              <div className="chips" style={{ marginBottom: 18 }}>
                {TARGETS.map(t => (
                  <button key={t} className={`chip ${target === t ? 'on' : ''}`} onClick={() => setTarget(t)}>{t}</button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={() => setStep(3)}>Suivant</button>
            </div>
          )}
          {step > 2 && <p className="small muted step-body" style={{ marginTop: -8 }}>Partie en {target} points</p>}

          <div className="step"><span className="step-num">3</span>Distributeur premier tour</div>
          {step === 3 && order && (
            <div className="step-body">
              <div className="chips" style={{ marginBottom: 18 }}>
                {order.map((id, i) => (
                  <button key={id} className={`chip ${dealer === i ? 'on' : ''}`} onClick={() => setDealer(i)}>{name(id)}</button>
                ))}
              </div>
              {err && <p className="error">{err}</p>}
              <button className="btn btn-primary" disabled={dealer === null || busy}
                onClick={async () => {
                  setBusy(true); setErr(null);
                  try {
                    const id = await api.startGame({ target, seats: order, firstDealer: dealer! });
                    router.push(`/partie/${id}`);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                    setBusy(false);
                  }
                }}>
                Commencer la partie
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
