import type { ReactNode } from "react";

/**
 * A small circular progress meter — a Stop's *done* Items over its total, drawn
 * as an arc. It renders nothing it is told to store: the fraction is passed in,
 * derived by the api on read (ADR-0005), so the ring is a pure view. Each caller
 * colours and sizes it to its own world; here the Trail's waypoints fill it.
 */
export function ProgressRing({
  size,
  stroke,
  progress,
  track,
  fill,
  center,
}: {
  size: number;
  stroke: number;
  /** Completion fraction, 0..1. */
  progress: number;
  track: string;
  fill: string;
  center?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <svg
      width={size}
      height={size}
      className="progress-ring"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={track}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={fill}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="progress-ring__value"
      />
      {center !== undefined && (
        <foreignObject x={0} y={0} width={size} height={size}>
          <div className="progress-ring__center">{center}</div>
        </foreignObject>
      )}
    </svg>
  );
}
