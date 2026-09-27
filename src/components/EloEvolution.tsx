'use client';
import { useMemo, useRef, useState } from 'react';
import { BASE_ELO } from '@/lib/elo';
import type { GameWithPlayers, Player } from '@/lib/types';

/**
 * Évolution de l'Elo de tous les joueurs classés dans le temps (Elo en ordonnée, date en abscisse).
 * Tous les joueurs en gris pour le contexte, jusqu'à MAX_FOCUS joueurs mis en couleur.
 * Palette catégorielle validée (4 premières couleurs, fond de carte #eff5f4) : ordre fixe,
 * une couleur reste attachée à son joueur tant qu'il est sélectionné.
 */
const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const MAX_FOCUS = SLOTS.length;
const CONTEXT = '#c3ced1';
const SURFACE = '#eff5f4';

type Pt = { t: number; elo: number };

const fmtDay = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** Graduations « rondes » de l'Elo : au plus 5 intervalles. */
function eloTicks(min: number, max: number) {
  const step = [10, 20, 25, 50, 100, 200].find(s => (Math.ceil(max / s) - Math.floor(min / s)) <= 5) ?? 500;
  const lo = Math.floor(min / step) * step, hi = Math.max(lo + step, Math.ceil(max / step) * step);
  return { lo, hi, ticks: Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step) };
}

/** Elo d'une série à l'instant t (l'Elo ne bouge qu'à la validation d'une partie). */
const eloAt = (pts: Pt[], t: number) => {
  let v = pts[0].elo;
  for (const p of pts) { if (p.t <= t) v = p.elo; else break; }
  return v;
};

export function EloEvolution({ games, profiles, uid }: { games: GameWithPlayers[]; profiles: Player[]; uid: string | null }) {
  const ranked = useMemo(() => profiles.filter(p => p.games_played > 0).sort((a, b) => b.elo - a.elo), [profiles]);

  const { series, t0, t1 } = useMemo(() => {
    const done = games.filter(g => g.status === 'validee')
      .map(g => ({ g, t: Date.parse(g.validated_at ?? g.created_at) }))
      .sort((a, b) => a.t - b.t);
    const start = done.length ? Math.min(...done.map(d => Date.parse(d.g.created_at))) : Date.now();
    const end = Math.max(Date.now(), ...done.map(d => d.t));
    const series = new Map<string, Pt[]>();
    ranked.forEach(p => {
      const pts: Pt[] = [{ t: start, elo: BASE_ELO }];
      done.forEach(({ g, t }) => {
        const row = g.players.find(x => x.profile_id === p.id);
        if (row?.elo_after != null) pts.push({ t, elo: row.elo_after });
      });
      pts.push({ t: end, elo: p.elo });
      series.set(p.id, pts);
    });
    return { series, t0: start, t1: end };
  }, [games, ranked]);

  // sélection : joueur -> couleur (slot), gardée tant qu'il reste sélectionné
  const [focus, setFocus] = useState<Map<string, number>>(() => {
    const ids = [...new Set([uid, ...ranked.map(p => p.id)].filter((x): x is string => !!x && ranked.some(p => p.id === x)))];
    return new Map(ids.slice(0, 3).map((id, i) => [id, i]));
  });
  const toggle = (id: string) => setFocus(prev => {
    const next = new Map(prev);
    if (next.has(id)) { next.delete(id); return next; }
    if (next.size >= MAX_FOCUS) return prev;
    const used = new Set(next.values());
    next.set(id, [0, 1, 2, 3].find(s => !used.has(s))!);
    return next;
  });

  const [hoverT, setHoverT] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (ranked.length === 0) {
    return <div className="empty">La courbe apparaîtra après la première partie validée.</div>;
  }

  const W = 340, H = 230, padL = 38, padR = 86, padT = 12, padB = 24;
  const all = [...series.values()].flat().map(p => p.elo);
  const { lo, hi, ticks } = eloTicks(Math.min(...all), Math.max(...all));
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => padL + ((t - t0) / span) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const path = (pts: Pt[]) =>
    pts.map((p, i) => (i === 0 ? `M${x(p.t)},${y(p.elo)}` : `H${x(p.t)}V${y(p.elo)}`)).join('');
  const name = (id: string) => profiles.find(p => p.id === id)?.display_name ?? '?';
  const focused = [...focus.entries()].sort((a, b) => a[1] - b[1]);

  // étiquettes directes en bout de courbe, écartées pour ne pas se chevaucher
  const labels = focused.map(([id, slot]) => ({ id, slot, elo: series.get(id)!.at(-1)!.elo, ly: y(series.get(id)!.at(-1)!.elo) }))
    .sort((a, b) => a.ly - b.ly);
  labels.forEach((l, i) => { if (i > 0) l.ly = Math.max(l.ly, labels[i - 1].ly + 14); });

  const xTicks = [t0, t0 + span / 2, t1];

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < padL - 6 || px > W - padR + 6) { setHoverT(null); return; }
    setHoverT(t0 + Math.max(0, Math.min(1, (px - padL) / (W - padL - padR))) * span);
  }

  const tipLeft = hoverT !== null ? (x(hoverT) / W) * 100 : 0;

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ touchAction: 'pan-y', display: 'block' }}
          aria-label={`Évolution de l’Elo : ${focused.map(([id]) => `${name(id)} ${series.get(id)!.at(-1)!.elo}`).join(', ')}`}
          onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHoverT(null)}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#dde7e5" />
              <text x={padL - 6} y={y(t) + 4} fontSize="10.5" textAnchor="end" fill="#7d8f97">{t}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={i} x={x(t)} y={H - 6} fontSize="10.5" fill="#7d8f97"
              textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>{fmtDay(t)}</text>
          ))}
          {ranked.filter(p => !focus.has(p.id)).map(p => (
            <path key={p.id} d={path(series.get(p.id)!)} fill="none" stroke={CONTEXT} strokeWidth="1.5" strokeLinejoin="round" />
          ))}
          {focused.map(([id, slot]) => (
            <path key={id} d={path(series.get(id)!)} fill="none" stroke={SLOTS[slot]} strokeWidth="2" strokeLinejoin="round" />
          ))}
          {labels.map(l => (
            <g key={l.id}>
              <circle cx={x(t1)} cy={y(l.elo)} r="4" fill={SLOTS[l.slot]} stroke={SURFACE} strokeWidth="2" />
              <text x={x(t1) + 8} y={l.ly + 4} fontSize="11.5" fill="#283a44">
                {name(l.id)} <tspan fill="#7d8f97">{l.elo}</tspan>
              </text>
            </g>
          ))}
          {hoverT !== null && (
            <>
              <line x1={x(hoverT)} x2={x(hoverT)} y1={padT} y2={H - padB} stroke="#7d8f97" strokeDasharray="3 3" />
              {focused.map(([id, slot]) => (
                <circle key={id} cx={x(hoverT)} cy={y(eloAt(series.get(id)!, hoverT))} r="4"
                  fill={SLOTS[slot]} stroke={SURFACE} strokeWidth="2" />
              ))}
            </>
          )}
        </svg>
        {hoverT !== null && focused.length > 0 && (
          <div className="viz-tip" style={{ left: `${tipLeft}%`, transform: `translateX(${tipLeft > 55 ? '-105%' : '5%'})` }}>
            <div className="viz-tip-date">{fmtDay(hoverT)}</div>
            {focused.map(([id, slot]) => (
              <div key={id} className="viz-tip-row">
                <span className="viz-swatch" style={{ background: SLOTS[slot] }} />
                <span>{name(id)}</span>
                <strong>{eloAt(series.get(id)!, hoverT)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="viz-legend" role="group" aria-label="Joueurs affichés en couleur">
        {ranked.map(p => {
          const slot = focus.get(p.id);
          return (
            <button key={p.id} className={`viz-chip ${slot !== undefined ? 'on' : ''}`} aria-pressed={slot !== undefined}
              onClick={() => toggle(p.id)}>
              <span className="viz-swatch" style={{ background: slot !== undefined ? SLOTS[slot] : CONTEXT }} />
              {p.display_name}
            </button>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: '8px 2px 0' }}>
        Touche un joueur pour l’afficher en couleur ({MAX_FOCUS} max). Glisse sur la courbe pour voir l’Elo à une date.
      </p>
    </div>
  );
}
