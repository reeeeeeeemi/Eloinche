import { isReussi } from '@/lib/scoring';
import type { Round } from '@/lib/types';

/** Pour chaque joueur : combien de fois il a pris, et combien de contrats réussis / chutés. */
export function PrisesTable({ rounds, players, name }: {
  rounds: Round[];
  players: string[];
  name: (id: string) => string;
}) {
  const rows = players.map(id => {
    const rs = rounds.filter(r => r.preneur_id === id);
    const won = rs.filter(isReussi).length;
    return { id, won, lost: rs.length - won };
  });
  return (
    <table className="stats">
      <thead><tr><th>Prises</th><th>Gagné</th><th>Perdu</th><th>Total</th></tr></thead>
      <tbody>
        {rows.map(p => (
          <tr key={p.id}>
            <td>{name(p.id)}</td>
            <td className="win-c">{p.won}</td>
            <td className="lose-c">{p.lost}</td>
            <td>{p.won + p.lost}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
