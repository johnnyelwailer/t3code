/**
 * The vector greeting at the head of My Work's first load: three work cards drift in from the
 * edges and settle into a list while a ring of dots orbits them. Drawn in `currentColor`
 * (`--primary`), so it belongs to whatever palette is painted rather than to one brand.
 *
 * Transform and opacity only (compositor-driven, no paint per frame); every keyframe is in
 * t3team-index-myWorkLoading.css and switched off under `prefers-reduced-motion`, where the
 * settled list stays as a still drawing.
 */
const CARDS = [
  { y: 22, width: 34, className: "t3team-mywork-loading-card-1" },
  { y: 36, width: 26, className: "t3team-mywork-loading-card-2" },
  { y: 50, width: 30, className: "t3team-mywork-loading-card-3" },
] as const;

const ORBIT_DOTS = [0, 72, 144, 216, 288] as const;

export function greetingForHour(hour: number): string {
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function MyWorkLoadingMark() {
  return (
    <svg viewBox="0 0 96 96" className="size-24 text-primary" aria-hidden focusable="false">
      <g className="t3team-mywork-loading-orbit">
        {ORBIT_DOTS.map((angle, index) => (
          <circle
            key={angle}
            cx="48"
            cy="6"
            r={index % 2 === 0 ? 2.6 : 1.8}
            fill="currentColor"
            opacity={index % 2 === 0 ? 0.9 : 0.45}
            transform={`rotate(${angle} 48 48)`}
          />
        ))}
      </g>
      <circle cx="48" cy="48" r="42" fill="none" stroke="currentColor" opacity="0.14" />
      {CARDS.map((card) => (
        <g key={card.y} className={`t3team-mywork-loading-card ${card.className}`}>
          <rect
            x="30"
            y={card.y}
            width="36"
            height="9"
            rx="4.5"
            fill="currentColor"
            opacity="0.14"
          />
          <circle cx="36" cy={card.y + 4.5} r="2.5" fill="currentColor" />
          <rect
            x="42"
            y={card.y + 2.5}
            width={card.width - 8}
            height="4"
            rx="2"
            fill="currentColor"
            opacity="0.7"
          />
        </g>
      ))}
    </svg>
  );
}
