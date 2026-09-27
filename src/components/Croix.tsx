/** Petites croix d'une paire (capots non annoncés), rien tant qu'elle n'en a pas. */
export function Croix({ n }: { n: number }) {
  if (!n) return null;
  return <span className="croix" aria-label={`${n} capot${n > 1 ? 's' : ''} non annoncé${n > 1 ? 's' : ''}`}>{'✕'.repeat(n)}</span>;
}
