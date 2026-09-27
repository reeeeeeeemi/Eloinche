'use client';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { Header } from '@/components/Header';
import { api } from '@/lib/data';
import { useGroup } from '@/lib/group';
import { useSession } from '@/lib/session';
import { useData } from '@/lib/useData';

const TARGETS = [1000, 1500, 2000, 3000];
/** Valeur du choix « sans groupe ». */
const FRIENDLY = 'amicale';
type Seat = 'left' | 'partner' | 'right';
const SEATS: [Seat, string][] = [['left', 'À ta gauche'], ['partner', 'Ton partenaire'], ['right', 'À ta droite']];

export default function NouvellePage() {
  const router = useRouter();
  const { uid, me } = useSession();
  const { groups, group } = useGroup();
  // groupe de la partie : celui affiché par défaut, ou partie amicale si on n'a pas de groupe
  const [picked, setPicked] = useState<string | null>(null);
  const choice = picked ?? group?.id ?? (groups ? FRIENDLY : null);
  const friendly = choice === FRIENDLY;
  const groupId = friendly ? null : choice;
  const { data: players } = useData(() => (groupId ? api.getPlayers(groupId) : Promise.resolve([])), [groupId]);
  // nombre de membres de chaque groupe, affiché dans le choix du groupe
  const { data: counts } = useData(async () => Object.fromEntries(
    await Promise.all((groups ?? []).map(async g => [g.id, (await api.getPlayers(g.id)).length] as const))), [groups?.map(g => g.id).join()]);
  const [activeSeat, setActiveSeat] = useState<Seat | null>('left');   // place en cours de choix (groupe)

  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);   // étape la plus loin atteinte : on peut y revenir d'un toucher
  const [seats, setSeats] = useState<Record<Seat, string>>({ left: '', partner: '', right: '' });   // ids, ou prénoms (amicale)
  const [target, setTarget] = useState(2000);
  const [dealer, setDealer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const others = [...(players ?? [])]
    .filter(p => p.id !== uid)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'));
  const chosen = SEATS.map(([k]) => seats[k].trim());
  const nameOf = (v: string) => (friendly ? v : players?.find(p => p.id === v)?.display_name ?? '');
  const groupLabel = friendly ? 'Partie amicale, sans groupe' : `Groupe ${groups?.find(g => g.id === groupId)?.name ?? ''}`;
  const enoughPlayers = friendly || (!!players && others.length >= 3);
  const playersOk = chosen.every(Boolean) && (friendly || new Set(chosen).size === 3);
  // ordre autour de la table (sens horaire) : toi, gauche, partenaire, droite
  const table = [me?.display_name ?? '', ...chosen.map(nameOf)];
  const stepOk = [enoughPlayers, playersOk, true, dealer !== null];

  const next = (s: number) => { setStep(s); setReached(r => Math.max(r, s)); };
  const pickGroup = (v: string) => {
    if (v === choice) return;
    setPicked(v); setSeats({ left: '', partner: '', right: '' }); setDealer(null); setReached(1); setActiveSeat('left');
  };
  /** Place un joueur sur la place active, puis passe à la prochaine place vide. */
  const seatPlayer = (id: string) => {
    if (!activeSeat) return;
    const nextSeats = { ...seats, [activeSeat]: id };
    setSeats(nextSeats);
    setActiveSeat(SEATS.map(([k]) => k).find(k => !nextSeats[k]) ?? null);
  };

  /** En-tête d'étape : un toucher rouvre l'étape déjà atteinte (les étapes d'avant doivent être remplies). */
  const header = (n: number, title: string, summary?: ReactNode) => {
    const open = step === n;
    const canOpen = !open && n <= reached && stepOk.slice(0, n - 1).every(Boolean);
    return (
      <button type="button" disabled={!canOpen} onClick={() => setStep(n)} aria-expanded={open}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: canOpen ? 'pointer' : 'default' }}>
        <span className={`step ${!open && n < reached && stepOk[n - 1] ? 'done' : ''}`}><span className="step-num">{n}</span>{title}</span>
        {!open && summary && n < reached && (
          <span className="small muted step-body" style={{ display: 'block', marginTop: -8 }}>{summary}</span>
        )}
      </button>
    );
  };

  async function start() {
    setBusy(true); setErr(null);
    try {
      const id = friendly
        ? await api.startFriendlyGame({ target, names: chosen as [string, string, string], firstDealer: dealer! })
        : await api.startGame({ groupId: groupId!, target, seats: [uid!, ...chosen] as [string, string, string, string], firstDealer: dealer! });
      router.push(`/partie/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <Header title="Nouvelle partie" />
      <main className="main">
        <div className="card card-pad">
          {header(1, 'Choix du groupe', groupLabel)}
          {step === 1 && (
            <div className="step-body" style={{ marginLeft: 0 }}>
              <div className="choices" role="radiogroup" aria-label="Groupe de la partie">
                {[...(groups ?? []).map(g => ({ id: g.id, label: g.name, sub: counts?.[g.id] != null ? `${counts[g.id]} membre${counts[g.id] > 1 ? 's' : ''}` : '' })),
                  { id: FRIENDLY, label: 'Sans groupe', sub: 'Partie amicale, ne compte pas pour l’Elo' }].map(o => (
                  <button key={o.id} type="button" role="radio" aria-checked={choice === o.id}
                    className={`choice ${choice === o.id ? 'on' : ''}`} onClick={() => pickGroup(o.id)}>
                    <span className="choice-text"><span className="choice-label">{o.label}</span>{o.sub && <span className="choice-sub">{o.sub}</span>}</span>
                    <span className="choice-check" aria-hidden>{choice === o.id && <Check size={15} strokeWidth={3} />}</span>
                  </button>
                ))}
              </div>
              {!friendly && players && !enoughPlayers && (
                <p className="small muted" style={{ margin: '0 0 14px' }}>
                  Il faut au moins 4 joueurs dans ce groupe : invite tes potes depuis <a href="/groupes" style={{ color: 'var(--teal)' }}>Groupes</a>,
                  ou lance une partie amicale.
                </p>
              )}
              <button className="btn btn-primary" disabled={!enoughPlayers} onClick={() => next(2)}>Suivant</button>
            </div>
          )}

          {header(2, 'Joueurs', playersOk && `${table[0]} et ${table[2]} contre ${table[1]} et ${table[3]}`)}
          {step === 2 && (
            <div className="step-body" style={{ marginLeft: 0 }}>
              <div className="seats">
                <div className="seat me"><span className="seat-label">Toi</span><span className="seat-name">{me?.display_name}</span></div>
                {SEATS.map(([key, label]) => friendly ? (
                  <label key={key} className="seat">
                    <span className="seat-label">{label}</span>
                    <input className="seat-input" value={seats[key]} maxLength={30} placeholder="Prénom" aria-label={label}
                      onChange={e => setSeats(s => ({ ...s, [key]: e.target.value }))} />
                  </label>
                ) : (
                  <div key={key} className={`seat ${activeSeat === key ? 'active' : ''}`}>
                    <button type="button" className="seat-pick" onClick={() => setActiveSeat(key)} aria-pressed={activeSeat === key}>
                      <span className="seat-label">{label}</span>
                      <span className={`seat-name ${seats[key] ? '' : 'vacant'}`}>{seats[key] ? nameOf(seats[key]) : 'Choisir'}</span>
                    </button>
                    {seats[key] && (
                      <button type="button" className="icon-act" aria-label={`Libérer la place ${label}`}
                        onClick={() => { setSeats(s => ({ ...s, [key]: '' })); setActiveSeat(key); }}><X size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
              {!friendly && activeSeat && (
                <>
                  <p className="hint" style={{ margin: '12px 0 8px' }}>{SEATS.find(([k]) => k === activeSeat)![1]} :</p>
                  <div className="chips" style={{ marginBottom: 16 }}>
                    {others.filter(p => !chosen.includes(p.id)).map(p => (
                      <button key={p.id} type="button" className="chip" onClick={() => seatPlayer(p.id)}>{p.display_name}</button>
                    ))}
                  </div>
                </>
              )}
              {(friendly || !activeSeat) && <div style={{ height: 14 }} />}
              <button className="btn btn-primary" disabled={!playersOk} onClick={() => next(3)}>Suivant</button>
            </div>
          )}

          {header(3, 'Paramètres de la partie', `Partie en ${target} points`)}
          {step === 3 && (
            <div className="step-body">
              <span className="field-label" style={{ marginLeft: 0 }}>Nombre de points à atteindre</span>
              <div className="chips" style={{ marginBottom: 18 }}>
                {TARGETS.map(t => (
                  <button key={t} className={`chip ${target === t ? 'on' : ''}`} onClick={() => setTarget(t)}>{t}</button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={() => next(4)}>Suivant</button>
            </div>
          )}

          {header(4, 'Distributeur premier tour', dealer !== null && table[dealer])}
          {step === 4 && (
            <div className="step-body">
              <div className="chips" style={{ marginBottom: 18 }}>
                {table.map((n, i) => (
                  <button key={i} className={`chip ${dealer === i ? 'on' : ''}`} onClick={() => setDealer(i)}>{n}</button>
                ))}
              </div>
              {err && <p className="error">{err}</p>}
              <button className="btn btn-primary" disabled={dealer === null || busy || !playersOk} onClick={start}>
                Commencer la partie
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
