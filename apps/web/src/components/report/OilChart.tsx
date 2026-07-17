interface Pt {
  label: string;
  value: number;
}

/** Hand-drawn editorial area chart (light) from an oil price series. */
export function OilChart({ series }: { series: Pt[] }) {
  if (series.length < 2) return null;
  const W = 520;
  const H = 220;
  const L = 52;
  const R = 500;
  const T = 30;
  const B = 180;
  const vals = series.map((s) => s.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => L + (i / (series.length - 1)) * (R - L);
  const y = (v: number) => B - ((v - min) / span) * (B - T);

  const pts = series.map((s, i) => ({ px: x(i), py: y(s.value), ...s }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");
  const area = `${line} L${R},${B} L${L},${B} Z`;
  const grid = [T, T + (B - T) / 3, T + (2 * (B - T)) / 3, B];
  const gv = [max, max - span / 3, max - (2 * span) / 3, min];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="유가 추이 차트">
      <defs>
        <linearGradient id="oilFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e1d29" stopOpacity="0.16" />
          <stop offset="1" stopColor="#6e1d29" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <g stroke="#d3c9b4" strokeWidth="1">
        {grid.map((gy, i) => (
          <line key={i} x1={L} y1={gy} x2={R} y2={gy} />
        ))}
      </g>
      <g fontFamily="IBM Plex Mono, ui-monospace, monospace" fontSize="11" fill="#948a76">
        {grid.map((gy, i) => (
          <text key={i} x={L - 8} y={gy + 4} textAnchor="end">
            {Math.round(gv[i])}
          </text>
        ))}
      </g>
      <path d={area} fill="url(#oilFill)" />
      <path d={line} fill="none" stroke="#6e1d29" strokeWidth="2.4" strokeLinecap="round" />
      {pts.map((p, i) => {
        const last = i === pts.length - 1;
        return (
          <g key={i}>
            <circle cx={p.px} cy={p.py} r={last ? 5.5 : 4.5} fill={last ? "#6e1d29" : "#fbf8f1"} stroke="#6e1d29" strokeWidth="2.2" />
            <text
              x={last ? p.px - 6 : p.px + 8}
              y={p.py - 8}
              textAnchor={last ? "end" : "start"}
              fontFamily="IBM Plex Mono, ui-monospace, monospace"
              fontSize="12"
              fontWeight="600"
              fill="#1e1b16"
            >
              ${p.value}
            </text>
            <text
              x={p.px}
              y={B + 24}
              textAnchor={i === 0 ? "start" : last ? "end" : "middle"}
              fontFamily="Noto Sans KR, system-ui, sans-serif"
              fontSize="10.5"
              fill="#948a76"
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
