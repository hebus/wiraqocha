const OPTIONS: Array<{ count: 2 | 3 | 4; label: string }> = [
  { count: 2, label: '2 Joueurs' },
  { count: 3, label: '3 Joueurs' },
  { count: 4, label: '4 Joueurs' },
];

export function StartScreen({ onStart }: { onStart: (count: 2 | 3 | 4) => void }) {
  return (
    <div className="start-screen">
      <div className="start-card">
        <div className="start-brand">
          <span>⚓</span>
          <h1>WIRAQOCHA</h1>
          <p>EXPEDITION PROTOCOL</p>
        </div>
        <h2>Nombre de joueurs</h2>
        <div className="start-options">
          {OPTIONS.map((o) => (
            <button key={o.count} className="start-option" onClick={() => onStart(o.count)}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="start-hint">Chaque consortium (Albion, Helios, Meridian, Valhalla) est ajouté dans cet ordre.</p>
      </div>
    </div>
  );
}
