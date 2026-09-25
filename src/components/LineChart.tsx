'use client';

interface Series { name: string; color: string; values: number[] }

/** Pas de graduation en centaines : le plus petit donnant au plus 5 intervalles. */
function hundredsStep(max: number) {
  return [100, 200, 500, 1000, 2000, 5000].find(st => Math.ceil(max / st) <= 5) ?? 10000;
}

/**
 * Petit graphe SVG sans dépendance. Toutes les séries partagent l'axe X (index).
 * zeroBased : axe Y qui part de 0, graduations en centaines, borne haute ajustée au score actuel.
 */
export function LineChart({ series, height = 200, zeroBased = false }: { series: Series[]; height?: number; zeroBased?: boolean }) {
  const W = 340, H = height, padL = 40, padR = 10, padT = 12, padB = 22;
  const all = series.flatMap(s => s.values);
  if (!all.length) return null;
  let min = Math.min(...all), max = Math.max(...all);
  let ticks: number[];
  if (zeroBased) {
    const step = hundredsStep(Math.max(max, 1));
    min = 0;
    max = Math.max(step, Math.ceil(max / step) * step);
    ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  } else {
    if (min === max) { min -= 10; max += 10; }
    const span = max - min;
    min -= span * 0.08; max += span * 0.08;
    ticks = [0, 0.5, 1].map(t => Math.round(min + t * (max - min)));
  }
  const n = Math.max(...series.map(s => s.values.length));
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Évolution">
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#dde7e5" />
            <text x={padL - 8} y={y(t) + 4} fontSize="11" textAnchor="end" fill="#7d8f97">{t}</text>
          </g>
        ))}
        {series.map(s => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ))}
        {series.map(s => s.values.length === 1 && (
          <circle key={s.name + 'pt'} cx={x(0)} cy={y(s.values[0])} r="4" fill={s.color} />
        ))}
      </svg>
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 13 }}>
          {series.map(s => (
            <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 3, background: s.color, display: 'inline-block' }} />{s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
