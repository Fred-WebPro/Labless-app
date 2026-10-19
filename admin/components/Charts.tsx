type Series = { label: string; color: string; values: number[] };

/** Grouped daily bars drawn to one scale. */
export function DailyBars({ days, series }: { days: string[]; series: Series[] }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const W = 600;
  const H = 140;
  const pad = 18;
  const slot = (W - pad) / Math.max(1, days.length);
  const bw = Math.max(2, (slot - 3) / series.length);

  return (
    <div className="bars">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Daily chart">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad} x2={W} y1={H - 16 - f * (H - 28)} y2={H - 16 - f * (H - 28)} stroke="#eeeee9" strokeWidth="1" />
        ))}
        <text x="0" y="12" fontSize="10" fill="#8a8a82">
          {max}
        </text>
        {days.map((d, i) =>
          series.map((s, j) => {
            const h = (s.values[i] / max) * (H - 28);
            return (
              <rect key={`${d}-${s.label}`} x={pad + i * slot + j * bw} y={H - 16 - h} width={bw - 1} height={h} fill={s.color} rx="1">
                <title>{`${d} · ${s.label}: ${s.values[i]}`}</title>
              </rect>
            );
          }),
        )}
        {days.map((d, i) =>
          i % Math.ceil(days.length / 6) === 0 ? (
            <text key={d} x={pad + i * slot} y={H - 3} fontSize="10" fill="#8a8a82">
              {d.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="empty">Пока нет данных</p>;
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar" key={r.label}>
          <span>{r.label}</span>
          <span className="hbar__track">
            <span className="hbar__fill" style={{ display: "block", width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="num">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
