import { useCharacter } from "../lib/data";
import { ATTR_ORDER, ATTRS, levelProgress, trend, TREND_ICON, type Attribute, type AttrSummary, type CharacterStat } from "../lib/character";

function levels(summary: AttrSummary[]) {
  const by = (a: Attribute) => summary.find((s) => s.attribute === a) ?? { attribute: a, xp_total: 0, xp_14: 0, xp_prev_14: 0 };
  return Object.fromEntries(ATTR_ORDER.map((a) => [a, { s: by(a), ...levelProgress(by(a).xp_total) }])) as Record<
    Attribute,
    { s: AttrSummary; level: number; pct: number; toNext: number }
  >;
}

/** Little figure whose build reflects the stats: broader with Körper, brighter mind with Intellekt, more sparkle with Charisma. */
export function Avatar({ k, i, c, size = 88 }: { k: number; i: number; c: number; size?: number }) {
  const body = Math.min(1, (k - 1) / 30); // 0..1
  const mind = Math.min(1, (i - 1) / 30);
  const sparkles = Math.min(6, Math.floor((c - 1) / 3) + 1);
  const shoulder = 15 + body * 9;
  const waist = 10 + body * 3;
  const arm = 4 + body * 3;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Charakter">
      <defs>
        <radialGradient id="mind" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.25 + mind * 0.6} />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="#111827" stroke="#1f2937" />
      <circle cx="50" cy="30" r={16 + mind * 8} fill="url(#mind)" />
      {/* arms */}
      <path d={`M${50 - shoulder} 48 Q${50 - shoulder - 4} 62 ${50 - shoulder + 1} 74`} stroke="#f87171" strokeWidth={arm} strokeLinecap="round" fill="none" />
      <path d={`M${50 + shoulder} 48 Q${50 + shoulder + 4} 62 ${50 + shoulder - 1} 74`} stroke="#f87171" strokeWidth={arm} strokeLinecap="round" fill="none" />
      {/* torso */}
      <path d={`M${50 - shoulder} 46 Q50 ${41 - body * 2} ${50 + shoulder} 46 L${50 + waist} 80 Q50 84 ${50 - waist} 80 Z`} fill="#ef4444" opacity="0.85" />
      <rect x="44" y="38" width="12" height="8" rx="3" fill="#e5e7eb" />
      {/* head */}
      <circle cx="50" cy="30" r="11" fill="#e5e7eb" />
      <circle cx="46" cy="29" r="1.4" fill="#111827" />
      <circle cx="54" cy="29" r="1.4" fill="#111827" />
      <path d="M46 34 Q50 37 54 34" stroke="#111827" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {/* charisma sparkles */}
      {Array.from({ length: sparkles }, (_, n) => {
        const angle = (-150 + n * 50) * (Math.PI / 180);
        const x = 50 + Math.cos(angle) * 33;
        const y = 34 + Math.sin(angle) * 26;
        return (
          <text key={n} x={x} y={y} fontSize="8" textAnchor="middle" fill="#fbbf24">
            ✦
          </text>
        );
      })}
    </svg>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, pct * 100)}%`, background: color }} />
    </div>
  );
}

/** Compact card for the home page. */
export function CharacterCard() {
  const { data } = useCharacter();
  const L = levels(data.summary);
  const total = ATTR_ORDER.reduce((s, a) => s + L[a].level, 0);
  return (
    <button onClick={() => (location.hash = "today/character")} className="card flex items-center gap-3 p-3 text-left">
      <Avatar k={L.koerper.level} i={L.intellekt.level} c={L.charisma.level} size={72} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">Joshua</span>
          <span className="text-xs text-slate-400">Gesamt-Level {total}</span>
        </div>
        {ATTR_ORDER.map((a) => {
          const t = trend(L[a].s);
          return (
            <div key={a} className="flex items-center gap-2 text-[11px]">
              <span className="w-20 shrink-0 text-slate-300">
                {ATTRS[a].emoji} {ATTRS[a].label}
              </span>
              <span className="w-8 shrink-0 font-semibold">L{L[a].level}</span>
              <Bar pct={L[a].pct} color={ATTRS[a].color} />
              <span className={`w-3 shrink-0 text-[9px] ${t === "up" ? "text-emerald-400" : t === "down" ? "text-red-400" : "text-slate-600"}`}>{TREND_ICON[t]}</span>
            </div>
          );
        })}
      </div>
    </button>
  );
}

function Radar({ stats }: { stats: CharacterStat[] }) {
  const n = stats.length;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r] as const;
  };
  const poly = stats.map((s, i) => pt(i, (s.rating / 100) * 38).join(",")).join(" ");
  return (
    <svg viewBox="-22 0 144 100" className="mx-auto h-56 w-full max-w-sm">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={stats.map((_, i) => pt(i, f * 38).join(",")).join(" ")} fill="none" stroke="#1f2937" strokeWidth="0.5" />
      ))}
      <polygon points={poly} fill="rgba(52,211,153,0.25)" stroke="#34d399" strokeWidth="1" />
      {stats.map((s, i) => {
        const [x, y] = pt(i, 46);
        return (
          <text key={s.id} x={x} y={y} fontSize="4" textAnchor="middle" dominantBaseline="middle" fill={ATTRS[s.attribute].color}>
            {s.name}
          </text>
        );
      })}
    </svg>
  );
}

export function CharacterView() {
  const { data } = useCharacter();
  const L = levels(data.summary);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <header className="flex items-center gap-2">
        <button className="btn-ghost px-2" onClick={() => (location.hash = "today")}>‹</button>
        <h1 className="text-xl font-semibold">Dein Charakter</h1>
      </header>

      <div className="flex justify-center">
        <Avatar k={L.koerper.level} i={L.intellekt.level} c={L.charisma.level} size={160} />
      </div>

      {data.stats.length >= 3 && (
        <section className="card p-3">
          <h2 className="text-sm font-semibold text-slate-300">Stärken & Schwächen</h2>
          <Radar stats={data.stats} />
        </section>
      )}

      {ATTR_ORDER.map((a) => {
        const { s, level, pct, toNext } = L[a];
        const t = trend(s);
        const sub = data.stats.filter((x) => x.attribute === a);
        return (
          <section key={a} className="card flex flex-col gap-2 p-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">
                {ATTRS[a].emoji} {ATTRS[a].label} <span className="ml-1 text-slate-400">Level {level}</span>
              </h2>
              <span className={`text-xs ${t === "up" ? "text-emerald-400" : t === "down" ? "text-red-400" : "text-slate-500"}`}>
                {TREND_ICON[t]} {s.xp_14} XP / 14 T{s.xp_prev_14 ? ` (vorher ${s.xp_prev_14})` : ""}
              </span>
            </div>
            <Bar pct={pct} color={ATTRS[a].color} />
            <p className="text-[11px] text-slate-500">
              {s.xp_total} XP · noch {toNext} bis Level {level + 1} · XP durch {ATTRS[a].how}
            </p>
            {sub.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-2">
                {sub.map((st) => (
                  <li key={st.id}>
                    <div className="flex justify-between text-xs">
                      <span>{st.name}</span>
                      <span className="text-slate-400">{st.rating}/100</span>
                    </div>
                    <Bar pct={st.rating / 100} color={ATTRS[a].color} />
                    {st.note && <p className="mt-0.5 text-[10px] text-slate-500">{st.note}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              a === "koerper" && <p className="text-xs text-slate-500">Noch nicht vermessen – schick Claude deine Fitnesswerte, dann wird dein Profil eingeordnet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
