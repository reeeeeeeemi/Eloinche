'use client';
import { useState } from 'react';
import { Delete, X } from 'lucide-react';
import { ATOUTS, FAUSSE_DONNE_PENALTY, TOTAL_POINTS, buildRound, fausseDonneRound, isSpecial } from '@/lib/scoring';
import type { Atout, Coinche, Contrat, Round, Team } from '@/lib/types';

interface Props {
  teamA: [string, string];
  teamB: [string, string];
  name: (id: string) => string;
  onClose: () => void;
  onSave: (r: Round) => void;
  /** Fausses donnes déjà faites par chaque paire avant cette manche (pour afficher la pénalité). */
  fdBefore?: { A: number; B: number };
  /** Manche à modifier (pré-remplit le formulaire). */
  initial?: Round;
}

/** Couleurs en SVG : les glyphes Unicode ♣♦♥♠ ne sont pas centrés verticalement (et deviennent des emoji sur iOS). */
function SuitIcon({ suit }: { suit: Atout }) {
  const shape = {
    trefle: <><circle cx="12" cy="7.5" r="4" /><circle cx="7.5" cy="13" r="4" /><circle cx="16.5" cy="13" r="4" /><path d="M11 12h2l1.5 9h-5z" /></>,
    carreau: <path d="M12 2l8 10-8 10-8-10z" />,
    coeur: <path d="M12 21s-7.5-4.6-9.5-9.2C1 8.4 3 5 6.5 5c2 0 3.5 1.1 5.5 3.2C14 6.1 15.5 5 17.5 5 21 5 23 8.4 21.5 11.8 19.5 16.4 12 21 12 21z" />,
    pique: <path d="M12 2C9 6 3 9 3 13.5c0 3 2.3 5 5 5 1.4 0 2.6-.5 3.3-1.4L10 22h4l-1.3-4.9c.7.9 1.9 1.4 3.3 1.4 2.7 0 5-2 5-5C21 9 15 6 12 2z" />,
  }[suit as 'trefle' | 'carreau' | 'coeur' | 'pique'];
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>{shape}</svg>;
}

const BIG = [140, 150, 160, 170, 180];

/** Points saisis par paire, reconstitués depuis une manche existante. */
function initialPts(r?: Round): { A: string; B: string } {
  if (!r || isSpecial(r.contrat) || r.points_preneur == null) return { A: '', B: '' };
  const mine = String(r.points_preneur), theirs = String(TOTAL_POINTS - r.points_preneur);
  return r.preneur === 'A' ? { A: mine, B: theirs } : { A: theirs, B: mine };
}

/** Manche fausse donne avec la pénalité qu'elle aura (à partir de la 2e de la paire : 160 à l'adversaire). */
function fausseDonnePreview(t: Team, before: { A: number; B: number }): Round {
  const pen = before[t] + 1 >= 2 ? FAUSSE_DONNE_PENALTY : 0;
  return { ...fausseDonneRound(t), score_a: t === 'B' ? pen : 0, score_b: t === 'A' ? pen : 0 };
}

export function AjoutManche({ teamA, teamB, name, onClose, onSave, fdBefore = { A: 0, B: 0 }, initial }: Props) {
  const [preneurId, setPreneurId] = useState<string | null>(initial?.preneur_id ?? null);
  const [atout, setAtout] = useState<Atout | null>(initial?.atout ?? null);
  const [contrat, setContrat] = useState<Contrat | null>(initial?.contrat ?? null);
  const [coinche, setCoinche] = useState<Coinche>(initial?.coinche ?? 1);
  const [pts, setPts] = useState<{ A: string; B: string }>(() => initialPts(initial));
  const [active, setActive] = useState<Team>('A');
  const [reussi, setReussi] = useState<boolean | null>(initial && isSpecial(initial.contrat) ? !!initial.reussi : null);
  const [belote, setBelote] = useState<Team | null>(initial?.belote ?? null);
  const [capot, setCapot] = useState<Team | null>(initial?.capot ?? null);
  const [fausseDonne, setFausseDonne] = useState<Team | null>(initial?.fausse_donne ?? null);
  const [plus, setPlus] = useState(false); // panneau des gros contrats (140-180)
  const bigContrat = typeof contrat === 'number' && contrat >= 140;

  const preneur: Team | null = preneurId ? (teamA.includes(preneurId) ? 'A' : 'B') : null;
  const special = contrat !== null && isSpecial(contrat);
  const labelA = teamA.map(name).join('/');
  const labelB = teamB.map(name).join('/');

  function toggleCapot(t: Team) {
    const next = capot === t ? null : t;
    setCapot(next);
    if (next) setPts({ A: next === 'A' ? String(TOTAL_POINTS) : '0', B: next === 'B' ? String(TOTAL_POINTS) : '0' });
  }

  function press(k: string) {
    setCapot(null);
    setPts(prev => {
      const cur = prev[active];
      const next = k === 'del' ? cur.slice(0, -1) : (cur + k).replace(/^0+(?=\d)/, '');
      if (next !== '' && Number(next) > TOTAL_POINTS) return prev;
      const other: Team = active === 'A' ? 'B' : 'A';
      return { [active]: next, [other]: next === '' ? '' : String(TOTAL_POINTS - Number(next)) } as { A: string; B: string };
    });
  }

  const pointsPreneur = preneur && pts[preneur] !== '' ? Number(pts[preneur]) : null;

  let missing: string | null = null;
  if (fausseDonne) missing = null; // fausse donne : rien d'autre à saisir
  else if (!preneur) missing = 'Choisir un preneur';
  else if (contrat === null) missing = 'Choisir un contrat';
  else if (special && reussi === null) missing = 'Réussi ou chuté ?';
  else if (!special && pointsPreneur === null) missing = 'Saisir les points';

  const preview = fausseDonne ? fausseDonnePreview(fausseDonne, fdBefore)
    : !missing && preneur && contrat !== null
    ? buildRound({
        preneur, preneur_id: preneurId, contrat, coinche, belote, atout,
        capot: special ? null : capot,
        points_preneur: special ? undefined : pointsPreneur ?? 0,
        reussi: special ? !!reussi : undefined,
      })
    : null;

  const numBtn = (c: number) => (
    <button key={c} className={contrat === c ? 'on' : ''} onClick={() => { setContrat(c); setReussi(null); }}>{c}</button>
  );

  const teamBox = (ids: [string, string]) => (
    <div className="team-box">
      {ids.map(id => (
        <button key={id} className={preneurId === id ? 'on' : ''} onClick={() => setPreneurId(id)}>{name(id)}</button>
      ))}
    </div>
  );

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Ajouter une manche">
        <div className="sheet-inner">
          <header className="header" style={{ position: 'static', margin: '0 -2px' }}>
            <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={26} /></button>
            <h1>{initial ? 'Modifier' : 'Ajout'}</h1><div />
          </header>

          <div className="preneur-grid">
            {teamBox(teamA)}
            <span className="center-label">Preneur</span>
            {teamBox(teamB)}
          </div>

          <div className="suits">
            {ATOUTS.map(a => (
              <button key={a.key} aria-label={a.name}
                className={`suit ${a.key === 'carreau' || a.key === 'coeur' ? 'red' : a.key === 'ta' || a.key === 'sa' ? '' : 'black'} ${atout === a.key ? 'on' : ''}`}
                onClick={() => setAtout(atout === a.key ? null : a.key)}>
                {a.label.length > 1 ? a.label : <SuitIcon suit={a.key} />}
              </button>
            ))}
          </div>

          <div className="contrat-grid">
            <div className="contrat-box">
              {[80, 90, 100].map(numBtn)}
              <button className={`wide ${contrat === 'capot' ? 'on' : ''}`} onClick={() => setContrat('capot')}>Capot</button>
              {[110, 120, 130].map(numBtn)}
              <button className={contrat === 'generale' ? 'on' : ''} onClick={() => setContrat('generale')}>Générale</button>
              <button className={bigContrat ? 'on' : ''} onClick={() => setPlus(true)}>{bigContrat ? contrat : 'Plus'}</button>
            </div>
            <div className="coinche-box">
              <button className={coinche === 2 ? 'on' : ''} onClick={() => setCoinche(coinche === 2 ? 1 : 2)}>Coinche</button>
              <button className={coinche === 4 ? 'on' : ''} onClick={() => setCoinche(coinche === 4 ? 1 : 4)}>Surcoinche</button>
            </div>
            {plus && (
              <>
                <div className="plus-backdrop" onClick={() => setPlus(false)} />
                <div className="plus-pop" role="listbox" aria-label="Autres contrats">
                  {BIG.map(c => (
                    <button key={c} className={contrat === c ? 'on' : ''}
                      onClick={() => { setContrat(c); setReussi(null); setPlus(false); }}>{c}</button>
                  ))}
                </div>
              </>
            )}
          </div>

          {special ? (
            <div className="opt-row">
              <button className={`opt-btn ${reussi === true ? 'on' : ''}`} onClick={() => setReussi(true)}>Réussi</button>
              <span className="center-label">{contrat === 'capot' ? 'Capot' : 'Générale'}</span>
              <button className={`opt-btn ${reussi === false ? 'on' : ''}`} onClick={() => setReussi(false)}>Chuté</button>
            </div>
          ) : (
            <div className="score-zone">
              <div className="score-fields">
                <button className={`score-field ${active === 'A' ? 'active' : ''}`} onClick={() => setActive('A')}
                  aria-label={`Points ${labelA}`}>{pts.A || '\u00a0'}</button>
                <span className="center-label">Score</span>
                <button className={`score-field ${active === 'B' ? 'active' : ''}`} onClick={() => setActive('B')}
                  aria-label={`Points ${labelB}`}>{pts.B || '\u00a0'}</button>
              </div>
              <div className="keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(k => (
                  <button key={k} onClick={() => press(k)}>{k}</button>
                ))}
                <button onClick={() => press('del')} aria-label="Effacer"><Delete size={20} /></button>
              </div>
            </div>
          )}

          <div className="opt-row">
            <button className={`opt-btn ${belote === 'A' ? 'on' : ''}`} onClick={() => setBelote(belote === 'A' ? null : 'A')}>{labelA}</button>
            <span className="center-label">Belote</span>
            <button className={`opt-btn ${belote === 'B' ? 'on' : ''}`} onClick={() => setBelote(belote === 'B' ? null : 'B')}>{labelB}</button>
          </div>

          {!special && (
            <div className="opt-row">
              <button className={`opt-btn ${capot === 'A' ? 'on' : ''}`} onClick={() => toggleCapot('A')}>{labelA}</button>
              <span className="center-label">Capot</span>
              <button className={`opt-btn ${capot === 'B' ? 'on' : ''}`} onClick={() => toggleCapot('B')}>{labelB}</button>
            </div>
          )}

          <div className="opt-row">
            <button className={`opt-btn ${fausseDonne === 'A' ? 'on' : ''}`} onClick={() => setFausseDonne(fausseDonne === 'A' ? null : 'A')}>{labelA}</button>
            <span className="center-label">Fausse donne</span>
            <button className={`opt-btn ${fausseDonne === 'B' ? 'on' : ''}`} onClick={() => setFausseDonne(fausseDonne === 'B' ? null : 'B')}>{labelB}</button>
          </div>

          <div className="total-row">
            <span>{preview ? preview.score_a : '–'}</span>
            <span className="center-label">Total</span>
            <span>{preview ? preview.score_b : '–'}</span>
          </div>

          <button className="btn btn-primary btn-block" disabled={!preview} onClick={() => preview && onSave(preview)}>
            {missing ?? (initial ? 'Enregistrer la manche' : 'Ajouter la manche')}
          </button>
        </div>
      </div>
    </>
  );
}
