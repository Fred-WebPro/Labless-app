/** Shown instantly while a section loads, so navigation never feels stuck. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="skeleton" style={{ width: 220, height: 34, marginBottom: 10 }} />
      <div className="skeleton" style={{ width: 320, height: 16, marginBottom: 24 }} />
      <div className="grid grid--stats">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card">
            <div className="skeleton" style={{ width: "60%", height: 12, marginBottom: 12 }} />
            <div className="skeleton" style={{ width: "40%", height: 28 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 18, marginBottom: 14 }} />
        ))}
      </div>
    </div>
  );
}
