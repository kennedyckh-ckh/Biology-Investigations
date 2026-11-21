/* Illustrations for the cover page: one scene per inquiry stage and the investigation-cycle diagram. */

const INK = "#102542";
const BLUE = "#2d65a8";
const SKY = "#dceafb";
const PAPER = "#f7faff";
const LEAF = "#2f8f6b";
const LEAF_LIGHT = "#d5efe3";
const AMBER = "#e3a23b";

/** Part 1: a planning clipboard with ticked variables, a hypothesis line and a pencil. */
export function DesignScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      <rect x="40" y="30" width="80" height="106" rx="9" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x="60" y="22" width="40" height="17" rx="5" fill={BLUE} stroke={INK} strokeWidth="3" />
      <circle cx="80" cy="30" r="3" fill="#fff" />
      {[56, 76, 96].map((y, i) => (
        <g key={y}>
          <rect x="52" y={y - 6} width="12" height="12" rx="3" fill={i < 2 ? LEAF_LIGHT : "#fff"} stroke={i < 2 ? LEAF : BLUE} strokeWidth="2" />
          {i < 2 && <path d={`M54.5 ${y} l3 3 5-6`} fill="none" stroke={LEAF} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
          <rect x="70" y={y - 3} width={i === 1 ? 28 : 38} height="6" rx="3" fill={i < 2 ? SKY : "#e8eef6"} />
        </g>
      ))}
      <path d="M52 117c8-6 14 4 22-1s12-6 20 0" fill="none" stroke={AMBER} strokeWidth="3" strokeLinecap="round" />
      <g transform="rotate(38 118 104)">
        <rect x="111" y="64" width="14" height="52" rx="3" fill={AMBER} stroke={INK} strokeWidth="2.6" />
        <rect x="111" y="64" width="14" height="9" rx="3" fill="#f6c7c3" stroke={INK} strokeWidth="2.6" />
        <path d="M111 116l7 14 7-14z" fill="#fbe3bd" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M116 125.5l2 4.5 2-4.5z" fill={INK} />
      </g>
    </svg>
  );
}

/** Part 2: a reaction flask connected to a gas syringe that is collecting gas. */
export function EnactScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cover-liquid" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9fd6c0" />
          <stop offset="1" stopColor={LEAF} />
        </linearGradient>
      </defs>
      {/* delivery tube and syringe */}
      <path d="M62 34V24h44" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="104" y="16" width="44" height="16" rx="3" fill={PAPER} stroke={INK} strokeWidth="3" />
      <rect x="106" y="18.5" width="17" height="11" fill={SKY} />
      {[112, 120, 128, 136, 144].map((x) => <path key={x} d={`M${x} 16v5`} stroke={BLUE} strokeWidth="1.8" />)}
      <path d="M123 18v12" stroke={INK} strokeWidth="2.6" />
      <path d="M123 24h30" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M153 18v12" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      {/* flask */}
      <path d="M52 34h20v28l26 52a10 10 0 0 1-9 14H35a10 10 0 0 1-9-14l26-52V34z" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M38 98h48l10 18a8 8 0 0 1-7 11H35a8 8 0 0 1-7-11z" fill="url(#cover-liquid)" />
      <path d="M52 34h20v28l26 52a10 10 0 0 1-9 14H35a10 10 0 0 1-9-14l26-52V34z" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <rect x="49" y="28" width="26" height="10" rx="2.5" fill={BLUE} stroke={INK} strokeWidth="2.6" />
      {[[48, 112, 3.5], [60, 104, 2.6], [70, 116, 3], [57, 86, 2.4], [64, 74, 2]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={i > 2 ? "#fff" : "#e9f7f0"} stroke={i > 2 ? LEAF : "none"} strokeWidth="1.6" />
      ))}
      {/* timer */}
      <circle cx="128" cy="96" r="18" fill="#fff" stroke={INK} strokeWidth="3" />
      <path d="M124 74h8M128 74v4" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M128 96V86M128 96l7 4" stroke={AMBER} strokeWidth="3" strokeLinecap="round" />
      <circle cx="128" cy="96" r="2.4" fill={INK} />
      <path d="M20 136h120" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Part 3: a results graph with a fitted trend, an outlier under the magnifier and a claim bubble. */
export function ReflectScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      <rect x="18" y="34" width="104" height="92" rx="9" fill="#fff" stroke={INK} strokeWidth="3" />
      <path d="M34 48v62h76" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {[60, 72, 84, 96].map((y) => <path key={y} d={`M36 ${y}h72`} stroke="#e3ebf5" strokeWidth="1.6" />)}
      <path d="M38 104c18-6 32-22 64-44" fill="none" stroke={BLUE} strokeWidth="3" strokeLinecap="round" strokeDasharray="1 0" />
      {[[44, 100], [56, 93], [68, 84], [80, 76], [94, 66]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5" fill={BLUE} stroke="#fff" strokeWidth="1.8" />)}
      <circle cx="74" cy="100" r="5" fill={AMBER} stroke="#fff" strokeWidth="1.8" />
      <circle cx="74" cy="100" r="13" fill="rgba(255,255,255,.35)" stroke={INK} strokeWidth="3" />
      <path d="M83.5 109.5l12 12" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M104 14h40a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8h-22l-11 9v-9h-7a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z" fill={LEAF_LIGHT} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M112 26h28M112 36h18" stroke={LEAF} strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

const SCENES = [DesignScene, EnactScene, ReflectScene];
const STAGE_LABELS = ["Design", "Enact", "Reflect"];

/** Three stages around a shared centre of evidence, joined by clockwise arrows. */
export function InquiryCycle({ className = "" }: { className?: string }) {
  const cx = 260, cy = 286, R = 168, nodeR = 80;
  const angles = [-90, 30, 150];
  const pt = (deg: number, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const gap = (Math.asin((nodeR + 14) / (2 * R)) * 2 * 180) / Math.PI;
  const arcs = angles.map((a, i) => {
    const start = a + gap;
    const end = angles[(i + 1) % 3] + (i === 2 ? 360 : 0) - gap;
    const [x1, y1] = pt(start);
    const [x2, y2] = pt(end);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  });
  return (
    <svg viewBox="0 0 520 540" className={className} role="img" aria-labelledby="cycle-title cycle-desc">
      <title id="cycle-title">The investigation cycle</title>
      <desc id="cycle-desc">Design, Enact and Reflect are arranged in a cycle around evidence. Arrows run from Design to Enact, from Enact to Reflect, and from Reflect back to Design.</desc>
      <defs>
        <marker id="cycle-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0l10 5-10 5z" fill={BLUE} />
        </marker>
        <radialGradient id="cycle-hub" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor={SKY} />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e3ebf5" strokeWidth="26" />
      {arcs.map((d) => <path key={d} d={d} fill="none" stroke={BLUE} strokeWidth="5" strokeLinecap="round" markerEnd="url(#cycle-arrow)" />)}
      {angles.slice(1).map((a) => {
        const [x, y] = pt(a, R - nodeR - 14);
        return <path key={a} d={`M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}`} stroke="#c0d7f1" strokeWidth="2" strokeDasharray="4 6" />;
      })}
      {(() => { const [x, y] = pt(-90, R - nodeR - 14); return <path d={`M${cx} ${cy}L${x} ${y}`} stroke="#c0d7f1" strokeWidth="2" strokeDasharray="4 6" />; })()}
      <circle cx={cx} cy={cy} r="54" fill="url(#cycle-hub)" stroke={BLUE} strokeWidth="2.5" />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="19" fontWeight="700" fill={INK}>Evidence</text>
      <text x={cx} y={cy + 19} textAnchor="middle" fontSize="12.5" fill="#40536c">at the centre</text>
      {angles.map((a, i) => {
        const [x, y] = pt(a);
        const Scene = SCENES[i];
        const labelBelow = i !== 0;
        return (
          <g key={a}>
            <circle cx={x} cy={y} r={nodeR} fill="#fff" stroke={INK} strokeWidth="3" />
            <circle cx={x} cy={y} r={nodeR - 8} fill={PAPER} />
            <svg x={x - 62} y={y - 62} width="124" height="124" viewBox="0 0 160 160" overflow="visible"><Scene /></svg>
            <g transform={`translate(${x} ${labelBelow ? y + nodeR + 26 : y - nodeR - 16})`}>
              <rect x="-50" y="-17" width="100" height="30" rx="15" fill={INK} />
              <text y="4" textAnchor="middle" fontSize="14.5" fontWeight="700" fill="#fff">{`${i + 1}  ${STAGE_LABELS[i]}`}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** Faint line art for the hero background: a DNA helix, a leaf cell and a scatter of data points. */
export function HeroBackdrop({ className = "" }: { className?: string }) {
  const strandA: string[] = [];
  const strandB: string[] = [];
  const rungs: [number, number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const y = i * 8;
    const x = 40 * Math.sin(i / 4.2);
    strandA.push(`${i ? "L" : "M"}${(80 + x).toFixed(1)} ${y}`);
    strandB.push(`${i ? "L" : "M"}${(80 - x).toFixed(1)} ${y}`);
    if (i % 3 === 0) rungs.push([80 + x, 80 - x, y]);
  }
  return (
    <svg viewBox="0 0 640 480" className={className} aria-hidden="true" fill="none" stroke="currentColor" preserveAspectRatio="xMaxYMid slice">
      <g transform="translate(470 -10) rotate(14)" strokeWidth="2">
        <path d={strandA.join("")} />
        <path d={strandB.join("")} opacity=".6" />
        {rungs.map(([a, b, y]) => <path key={y} d={`M${a.toFixed(1)} ${y}H${b.toFixed(1)}`} strokeWidth="1.3" opacity=".7" />)}
      </g>
      <g transform="translate(330 300)" strokeWidth="1.6">
        <path d="M0 60C0 10 60-20 120 0c30 10 40 50 20 80-25 35-90 40-120 20C8 92 0 78 0 60z" />
        <ellipse cx="70" cy="45" rx="22" ry="18" />
        <circle cx="72" cy="45" r="7" />
        <path d="M30 70c10-5 18 2 26-3M95 85c8-6 16-2 22-7" />
      </g>
    </svg>
  );
}
