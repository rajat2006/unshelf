/**
 * PROTOTYPE (issue #21) — throwaway. A small circular progress meter (a Stop's
 * done/total Items as an arc). Shared as a widget, not a layout — each variant
 * colours and sizes it to its own world. Renders a check when full.
 */
export function ProgressRing({
  size,
  stroke,
  progress,
  done,
  track,
  fill,
  center,
}: {
  size: number;
  stroke: number;
  progress: number; // 0..1
  done: boolean;
  track: string;
  fill: string;
  center?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={fill}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 350ms ease" }}
      />
      {center !== undefined ? (
        <foreignObject x={0} y={0} width={size} height={size}>
          <div
            style={{
              width: size,
              height: size,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: size * 0.28,
              fontWeight: 700,
              color: fill,
            }}
          >
            {done ? "✓" : center}
          </div>
        </foreignObject>
      ) : (
        done && (
          <text x="50%" y="50%" dy={size * 0.1} textAnchor="middle" fontSize={size * 0.4} fill={fill}>
            ✓
          </text>
        )
      )}
    </svg>
  );
}
