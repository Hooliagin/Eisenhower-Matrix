import { useEffect, useState } from "react";
import { useCharacter } from "../lib/data";
import { parseDate } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { ATTR_ORDER, ATTRS, form, levelProgress, trend, TREND_ICON, type Attribute, type AttrSummary, type CharacterStat } from "../lib/character";

function levels(summary: AttrSummary[]) {
  const by = (a: Attribute) => summary.find((s) => s.attribute === a) ?? { attribute: a, xp_total: 0, xp_14: 0, xp_prev_14: 0 };
  return Object.fromEntries(ATTR_ORDER.map((a) => [a, { s: by(a), ...levelProgress(by(a).xp_total) }])) as Record<
    Attribute,
    { s: AttrSummary; level: number; pct: number; toNext: number }
  >;
}

/** Little figure whose build reflects the stats: broader with Körper, brighter mind with Intellekt, more sparkle with Charisma. */
export function Avatar({ k, i, c, sp = 1, size = 88 }: { k: number; i: number; c: number; sp?: number; size?: number }) {
  const body = Math.min(1, (k - 1) / 30); // 0..1
  const mind = Math.min(1, (i - 1) / 30);
  const sparkles = Math.min(6, Math.floor((c - 1) / 3) + 1);
  const halo = Math.min(1, (sp - 1) / 20);
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
      {sp > 1 && <ellipse cx="50" cy="16" rx="10" ry="2.6" fill="none" stroke="#a78bfa" strokeWidth="1.6" opacity={0.35 + halo * 0.65} />}
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
      <Avatar k={L.koerper.level} i={L.intellekt.level} c={L.charisma.level} sp={L.spirit.level} size={72} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">Joshua</span>
          <span className="text-xs text-slate-400">Gesamt-Level {total}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {ATTR_ORDER.map((a) => {
            const t = trend(L[a].s);
            return (
              <div key={a} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-4 shrink-0 text-center">{ATTRS[a].emoji}</span>
                <span className="w-6 shrink-0 font-semibold">{L[a].level}</span>
                <Bar pct={form(L[a].s) / 100} color={ATTRS[a].color} />
                <span className={`w-2.5 shrink-0 text-[8px] ${t === "up" ? "text-emerald-400" : t === "down" ? "text-red-400" : "text-slate-600"}`}>{TREND_ICON[t]}</span>
              </div>
            );
          })}
        </div>
        <span className="text-[10px] text-slate-600">Zahl = Level · Balken = Form der letzten 14 Tage</span>
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

interface Measurement {
  measured_on: string;
  metric: string;
  value: number;
  unit: string | null;
  note: string | null;
}

// For these a falling value is the good direction.
const LOWER_IS_BETTER = new Set(["Körperfett", "Viszerales Fett", "Taillenumfang", "BMI", "ECW/TBW"]);
// Direction depends on the goal – shown without judgement.
const NEUTRAL = new Set(["Körpergewicht", "Größe", "Ruheumsatz"]);

function Measurements() {
  const [rows, setRows] = useState<Measurement[]>([]);
  useEffect(() => {
    supabase
      .from("measurements")
      .select("measured_on, metric, value, unit, note")
      .order("measured_on", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Measurement[]));
  }, []);
  if (!rows.length) return null;

  const latestDate = rows[0].measured_on;
  const latest = rows.filter((r) => r.measured_on === latestDate);
  const fmt = (d: string) => parseDate(d).toLocaleDateString("de-DE", { month: "short", year: "numeric" });

  return (
    <section className="card p-3">
      <h2 className="text-sm font-semibold text-slate-300">📏 Messungen · {fmt(latestDate)}</h2>
      <table className="mt-2 w-full text-xs">
        <tbody>
          {latest.map((m) => {
            const prev = rows.find((r) => r.metric === m.metric && r.measured_on < latestDate);
            const delta = prev ? Number(m.value) - Number(prev.value) : 0;
            const good = LOWER_IS_BETTER.has(m.metric) ? delta < 0 : delta > 0;
            return (
              <tr key={m.metric} className="border-t border-slate-800">
                <td className="py-1.5 pr-2 text-slate-300">{m.metric}</td>
                <td className="whitespace-nowrap text-right font-medium">
                  {Number(m.value).toLocaleString("de-DE")} {m.unit}
                </td>
                <td className="w-28 whitespace-nowrap pl-2 text-right text-[11px]">
                  {prev && delta !== 0 && (
                    <span className={NEUTRAL.has(m.metric) ? "text-slate-400" : good ? "text-emerald-400" : "text-amber-400"}>
                      {delta > 0 ? "+" : ""}
                      {Number(delta.toFixed(2)).toLocaleString("de-DE")} seit {fmt(prev.measured_on)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
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

      <p className="text-xs text-slate-500">
        Das <b>Level</b> zeigt, was du insgesamt aufgebaut hast – es fällt nie. Die <b>Form</b> zeigt die letzten 14 Tage gegen
        dein Wochenziel – sie sinkt, wenn du einen Bereich vernachlässigst.
      </p>
      <div className="flex justify-center">
        <Avatar k={L.koerper.level} i={L.intellekt.level} c={L.charisma.level} sp={L.spirit.level} size={160} />
      </div>

      {data.stats.length >= 3 && (
        <section className="card p-3">
          <h2 className="text-sm font-semibold text-slate-300">Stärken & Schwächen</h2>
          <Radar stats={data.stats} />
        </section>
      )}

      <Measurements />

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
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-12">Level</span>
              <Bar pct={pct} color={ATTRS[a].color} />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-12">Form</span>
              <Bar pct={form(s) / 100} color={ATTRS[a].color} />
              <span className="w-9 text-right">{form(s)} %</span>
            </div>
            <p className="text-[11px] text-slate-500">
              {s.xp_total} XP · noch {toNext} bis Level {level + 1} · Ziel {ATTRS[a].weeklyTarget} XP/Woche · XP durch {ATTRS[a].how}
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
