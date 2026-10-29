import { useEffect, useState } from "react";
import { fmtMetric, useCharacter, useProgress, type MetricProgress } from "../lib/data";
import { isoDate, parseDate } from "../lib/dates";
import { byMetric, useMeasurements } from "./fitness/BodyValues";
import PixelAvatar from "./PixelAvatar";
import {
  ATTR_ORDER,
  ATTRS,
  backgroundXp,
  characterLevel,
  creditTier,
  form,
  levelProgress,
  rank,
  TIERS,
  trend,
  TREND_ICON,
  type Attribute,
  type AttrSummary,
  type CharacterStat,
  type Skill,
} from "../lib/character";

type Leveled = { s: AttrSummary; bg: number; xp: number; level: number; pct: number; toNext: number };

/** Attribute levels from activity XP plus background XP (skills you already had before the app). */
function levels(summary: AttrSummary[], skills: Skill[]) {
  const by = (a: Attribute) => summary.find((s) => s.attribute === a) ?? { attribute: a, xp_total: 0, xp_14: 0, xp_prev_14: 0 };
  return Object.fromEntries(
    ATTR_ORDER.map((a) => {
      const s = by(a);
      const bg = backgroundXp(skills, a);
      const xp = Number(s.xp_total) + bg;
      return [a, { s, bg, xp, ...levelProgress(xp) }];
    }),
  ) as Record<Attribute, Leveled>;
}

function Bar({ pct, color, h = "h-1.5" }: { pct: number; color: string; h?: string }) {
  return (
    <div className={`${h} w-full overflow-hidden rounded-sm bg-slate-800`}>
      <div className="h-full" style={{ width: `${Math.max(3, Math.min(1, pct) * 100)}%`, background: color }} />
    </div>
  );
}

/** Segmented "pixel" bar like an RPG HP/XP bar. */
function PixelBar({ pct, color, segments = 12 }: { pct: number; color: string; segments?: number }) {
  const on = Math.round(Math.max(0, Math.min(1, pct)) * segments);
  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className="h-2 flex-1" style={{ background: i < on ? color : "#1e293b" }} />
      ))}
    </div>
  );
}

function TierPips({ tier, color }: { tier: number; color: string }) {
  return (
    <span className="font-pixel text-xs tracking-tight">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < tier ? color : "#334155" }}>
          ◆
        </span>
      ))}
    </span>
  );
}

/** Pick a quest of the day from the skills' next steps (rotates daily). */
function questOfDay(skills: Skill[]): Skill | null {
  const q = skills.filter((s) => s.next_step);
  if (!q.length) return null;
  const day = Math.floor(Date.now() / 86_400_000);
  return q[day % q.length];
}

/** Remembers last seen levels on this device and reports what went up since. */
function useLevelUps(levelsNow: Record<string, number>, ready: boolean): string[] {
  const [ups, setUps] = useState<string[]>([]);
  const key = JSON.stringify(levelsNow);
  useEffect(() => {
    if (!ready) return;
    try {
      const prev = JSON.parse(localStorage.getItem("char-levels") ?? "null") as Record<string, number> | null;
      if (prev) setUps(Object.keys(levelsNow).filter((k) => prev[k] != null && levelsNow[k] > prev[k]));
      localStorage.setItem("char-levels", key);
    } catch {
      /* storage unavailable */
    }
  }, [key, ready]);
  return ups;
}

/** Today's new personal bests – one quiet line on the home card, only when there is something. */
function TodayRecords() {
  const { data } = useProgress();
  const recs = data.filter((m) => m.is_record && m.latest_day === isoDate());
  if (!recs.length) return null;
  return (
    <span className="truncate text-[11px] text-amber-300">
      🏆 Neue Bestleistung: {recs.map((m) => `${m.label} ${fmtMetric(m.latest, m.unit)}`).join(" · ")}
    </span>
  );
}

function ProgressRow({ m }: { m: MetricProgress }) {
  const today = m.latest_day === isoDate();
  const day = today ? "heute" : parseDate(m.latest_day).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  const delta = m.avg_prev != null ? Number(m.latest) - Number(m.avg_prev) : null;
  return (
    <tr className="border-t border-slate-800 align-top">
      <td className="py-1.5 pr-2">
        <div className="text-slate-300">{m.label}</div>
        <div className="text-[10px] text-slate-500">
          Bestwert {fmtMetric(m.best_all, m.unit)}
          {m.avg_prev != null && <> · Ø 4 Wochen {fmtMetric(m.avg_prev, m.unit)}</>}
        </div>
      </td>
      <td className="whitespace-nowrap py-1.5 text-right">
        <div className="font-medium">
          {m.is_record && "🏆 "}
          {fmtMetric(m.latest, m.unit)}
        </div>
        <div className={`text-[10px] ${m.is_record ? "text-amber-300" : m.above_avg ? "text-emerald-400" : "text-slate-500"}`}>
          {day}
          {m.is_record ? " · Rekord" : delta != null && delta !== 0 ? ` · ${delta > 0 ? "+" : "−"}${fmtMetric(Math.abs(delta), m.unit)} zum Ø` : ""}
        </div>
      </td>
    </tr>
  );
}

/** Latest value per metric vs. the usual and the personal best. */
function Progress() {
  const { data } = useProgress();
  if (!data.length) return null;
  return (
    <section className="card p-3">
      <h2 className="text-sm font-semibold text-slate-300">📈 Fortschritt & Rekorde</h2>
      <p className="text-[10px] text-slate-500">Letzter Wert gegen deinen Schnitt der 4 Wochen davor und deinen Bestwert.</p>
      <table className="mt-2 w-full text-xs">
        <tbody>
          {data.map((m) => (
            <ProgressRow key={m.metric} m={m} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** RPG character sheet on the home page: pixel avatar, character level, six attributes with ranks, credits, quest. */
export function CharacterCard() {
  const { data, loading } = useCharacter();
  const L = levels(data.summary, data.skills);
  const totalXp = ATTR_ORDER.reduce((s, a) => s + L[a].xp, 0);
  const C = characterLevel(totalXp);
  const top = [...ATTR_ORDER].sort((a, b) => L[b].xp - L[a].xp)[0];
  const quest = questOfDay(data.skills);
  const credits = data.meta?.credits ?? 0;
  const ups = useLevelUps(
    { char: C.level, ...Object.fromEntries(ATTR_ORDER.map((a) => [a, L[a].level])) },
    !loading && data.skills.length > 0,
  );
  const upLabel = ups.map((u) => (u === "char" ? `Charakter LV ${C.level}` : `${ATTRS[u as Attribute].label} LV ${L[u as Attribute].level}`));

  return (
    <button
      onClick={() => (location.hash = "today/character")}
      className="pixel-frame relative overflow-hidden bg-gradient-to-b from-slate-900 to-[#0b0f17] p-3 text-left"
      style={{ ["--glow" as string]: ATTRS[top].color + "66" }}
    >
      {upLabel.length > 0 && (
        <div className="animate-levelup pointer-events-none absolute inset-x-0 top-8 z-10 text-center font-pixel text-xl text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,.8)]">
          ⬆ LEVEL UP!
          <div className="text-xs text-amber-200">{upLabel.join(" · ")}</div>
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <span className="font-pixel text-lg leading-none text-slate-100">JOSHUA</span>
        <span className="font-pixel text-sm text-amber-300">LV {C.level}</span>
      </div>
      <div className="font-pixel text-[11px] text-cyan-300">{data.meta?.class_title ?? "Abenteurer"}</div>

      <div className="mt-2 flex gap-3">
        <div className="flex shrink-0 flex-col items-center justify-end">
          <PixelAvatar size={112} glow={ATTRS[top].color} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          {ATTR_ORDER.map((a) => {
            const t = trend(L[a].s);
            return (
              <div key={a}>
                <div className="flex items-baseline gap-1 text-[11px] leading-none">
                  <span className="w-4 text-center">{ATTRS[a].emoji}</span>
                  <span className="truncate font-pixel text-slate-300">{rank(a, L[a].level).title}</span>
                  <span className={`text-[8px] ${t === "up" ? "text-emerald-400" : t === "down" ? "text-red-400" : "text-slate-600"}`}>{TREND_ICON[t]}</span>
                  <span className="ml-auto font-pixel" style={{ color: ATTRS[a].color }}>
                    {L[a].level}
                  </span>
                </div>
                <div className="mt-0.5 pl-5">
                  <PixelBar pct={L[a].pct} color={ATTRS[a].color} segments={10} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-12 font-pixel text-amber-300">XP</span>
          <div className="flex-1">
            <PixelBar pct={C.pct} color="#fbbf24" segments={20} />
          </div>
          <span className="font-pixel text-slate-400">{C.toNext} → LV {C.level + 1}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-12 font-pixel text-emerald-300">₵ {credits}</span>
          <div className="flex-1">
            <PixelBar pct={credits / 100} color="#34d399" segments={20} />
          </div>
          <span className="font-pixel text-slate-400">{creditTier(credits)}</span>
        </div>
      </div>

      {quest && (
        <div className="mt-2 truncate rounded-sm border border-slate-800 bg-slate-950/60 px-2 py-1 text-[11px]">
          <span className="font-pixel text-amber-300">▶ QUEST</span> <span className="text-slate-300">{quest.next_step}</span>
        </div>
      )}
      <TodayRecords />
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

const KEY_VALUES = ["Körpergewicht", "Körperfett", "Skelettmuskelmasse", "Phasenwinkel", "Schulterdrücken 1RM"];

/** Key body values (latest per metric) + link to the full list with history and comparison under Fitness. */
function Measurements() {
  const map = byMetric(useMeasurements());
  const keys = KEY_VALUES.filter((k) => map.has(k));
  if (!map.size) return null;
  return (
    <button className="card p-3 text-left" onClick={() => (location.hash = "fitness/body")}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-300">📏 Deine Werte</h2>
        <span className="text-xs text-slate-400">alle {map.size} & Vergleich →</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {keys.map((k) => {
          const [m] = map.get(k)!;
          return (
            <div key={k} className="flex justify-between gap-1">
              <span className="truncate text-slate-400">{k.replace(" 1RM", "")}</span>
              <span className="font-medium">
                {Number(Number(m.value).toFixed(1)).toLocaleString("de-DE")} {m.unit}
              </span>
            </div>
          );
        })}
      </div>
    </button>
  );
}

type Tab = "werte" | "skills" | "erfolge" | "fortschritt";

export function CharacterView() {
  const { data } = useCharacter();
  const L = levels(data.summary, data.skills);
  const totalXp = ATTR_ORDER.reduce((s, a) => s + L[a].xp, 0);
  const C = characterLevel(totalXp);
  const top = [...ATTR_ORDER].sort((a, b) => L[b].xp - L[a].xp)[0];
  const [tab, setTab] = useState<Tab>("werte");
  const credits = data.meta?.credits ?? 0;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <header className="flex items-center gap-2">
        <button className="btn-ghost px-2" onClick={() => (location.hash = "today")}>‹</button>
        <h1 className="text-xl font-semibold">Charakter</h1>
      </header>

      <section className="pixel-frame flex items-center gap-4 bg-gradient-to-b from-slate-900 to-[#0b0f17] p-4" style={{ ["--glow" as string]: ATTRS[top].color + "66" }}>
        <PixelAvatar size={150} glow={ATTRS[top].color} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-pixel text-2xl leading-none">JOSHUA</span>
          <span className="font-pixel text-xs text-cyan-300">{data.meta?.class_title ?? "Abenteurer"}</span>
          <span className="font-pixel text-3xl text-amber-300">LV {C.level}</span>
          <PixelBar pct={C.pct} color="#fbbf24" segments={14} />
          <span className="text-[10px] text-slate-500">
            {totalXp.toLocaleString("de-DE")} XP · noch {C.toNext} bis LV {C.level + 1}
          </span>
          <span className="mt-1 font-pixel text-xs text-emerald-300">
            ₵ {credits} · {creditTier(credits)}
          </span>
          <PixelBar pct={credits / 100} color="#34d399" segments={14} />
        </div>
      </section>

      <div className="grid grid-cols-4 gap-1 font-pixel text-xs">
        {(
          [
            ["werte", "Werte"],
            ["skills", "Skills"],
            ["erfolge", "Erfolge"],
            ["fortschritt", "Stats"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-sm py-2 ${tab === k ? "bg-amber-400 text-slate-900" : "bg-slate-800 text-slate-300"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "werte" && (
        <>
          <p className="text-[11px] text-slate-500">
            <b>Level</b> = alles, was du aufgebaut hast (fällt nie), inklusive Vorgeschichte aus deinen Skills. Alle 5 Level ein neuer <b>Rang</b>.
            <b> Form</b> = letzte 14 Tage gegen dein Wochenziel – sinkt, wenn du einen Bereich vernachlässigst.
          </p>
          {ATTR_ORDER.map((a) => {
            const { s, bg, xp, level, pct, toNext } = L[a];
            const t = trend(s);
            const r = rank(a, level);
            const sub = data.stats.filter((x) => x.attribute === a);
            return (
              <section key={a} className="card flex flex-col gap-2 p-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-semibold">
                    {ATTRS[a].emoji} {ATTRS[a].label} <span className="font-pixel" style={{ color: ATTRS[a].color }}>LV {level}</span>
                  </h2>
                  <span className="font-pixel text-xs text-slate-300">{r.title}</span>
                </div>
                <PixelBar pct={pct} color={ATTRS[a].color} segments={20} />
                <p className="text-[11px] text-slate-500">
                  {xp.toLocaleString("de-DE")} XP{bg ? ` (davon ${bg} Vorgeschichte)` : ""} · noch {toNext} bis LV {level + 1}
                  {r.next && ` · Rang „${r.next}“ ab LV ${r.nextAt}`}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="w-10">Form</span>
                  <Bar pct={form(s) / 100} color={ATTRS[a].color} />
                  <span className="w-10 whitespace-nowrap text-right">{form(s)} %</span>
                  <span className={`text-[10px] ${t === "up" ? "text-emerald-400" : t === "down" ? "text-red-400" : "text-slate-500"}`}>{TREND_ICON[t]}</span>
                </div>
                <p className="text-[10px] text-slate-600">
                  {s.xp_14} XP in 14 Tagen · Ziel {ATTRS[a].weeklyTarget} XP/Woche · XP durch {ATTRS[a].how}
                </p>
                {sub.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-2 border-t border-slate-800 pt-2">
                    {sub.map((st) => (
                      <li key={st.id}>
                        <div className="flex justify-between text-xs">
                          <span>{st.name}</span>
                          <span className="font-pixel text-slate-400">{st.rating}</span>
                        </div>
                        <Bar pct={st.rating / 100} color={ATTRS[a].color} />
                        {st.note && <p className="mt-0.5 text-[10px] text-slate-500">{st.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {data.stats.length >= 3 && (
            <section className="card p-3">
              <h2 className="text-sm font-semibold text-slate-300">Körper-Profil</h2>
              <Radar stats={data.stats} />
            </section>
          )}
        </>
      )}

      {tab === "skills" && (
        <>
          <p className="text-[11px] text-slate-500">
            Stufen: {TIERS.slice(1).join(" → ")}. Jede Stufe zählt als Vorgeschichte-XP für ihren Wert. Claude stuft hoch, sobald du die Quest geschafft hast.
          </p>
          {ATTR_ORDER.filter((a) => data.skills.some((k) => k.attribute === a)).map((a) => (
            <section key={a} className="card p-3">
              <h2 className="text-sm font-semibold" style={{ color: ATTRS[a].color }}>
                {ATTRS[a].emoji} {ATTRS[a].label}
              </h2>
              <ul className="mt-1 flex flex-col">
                {data.skills
                  .filter((k) => k.attribute === a)
                  .map((k) => (
                    <li key={k.id} className="border-t border-slate-800 py-2 first:border-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm">
                          {k.icon} {k.name}
                        </span>
                        <TierPips tier={k.tier} color={ATTRS[a].color} />
                      </div>
                      <div className="font-pixel text-[11px] text-slate-400">{TIERS[k.tier]}</div>
                      {k.note && <p className="text-[11px] text-slate-500">{k.note}</p>}
                      {k.next_step && (
                        <p className="mt-1 text-[11px] text-amber-300">
                          ▶ Quest → {TIERS[Math.min(5, k.tier + 1)]}: <span className="text-slate-200">{k.next_step}</span>
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <section className="card p-3">
            <h2 className="text-sm font-semibold text-emerald-300">₵ Credits</h2>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1">
                <PixelBar pct={credits / 100} color="#34d399" segments={20} />
              </div>
              <span className="font-pixel text-xs">{creditTier(credits)}</span>
            </div>
            {data.meta?.credits_note && <p className="mt-1 text-[11px] text-slate-500">{data.meta.credits_note}</p>}
            {data.meta?.credits_next && (
              <p className="mt-1 text-[11px] text-amber-300">
                ▶ Quest: <span className="text-slate-200">{data.meta.credits_next}</span>
              </p>
            )}
          </section>
        </>
      )}

      {tab === "erfolge" && (
        <>
          {(["milestone", "background"] as const).map((kind) => {
            const list = data.achievements.filter((x) => x.kind === kind);
            if (!list.length) return null;
            return (
              <section key={kind} className="card p-3">
                <h2 className="text-sm font-semibold text-slate-300">{kind === "milestone" ? "🏆 Errungenschaften" : "📜 Vorgeschichte"}</h2>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {list.map((x) => (
                    <div key={x.id} className="pixel-frame flex flex-col gap-0.5 bg-slate-950/60 p-2" style={{ ["--glow" as string]: (x.attribute ? ATTRS[x.attribute].color : "#fbbf24") + "33" }}>
                      <span className="text-2xl">{x.icon ?? "🏆"}</span>
                      <span className="font-pixel text-xs leading-tight text-slate-100">{x.title}</span>
                      {x.description && <span className="text-[10px] leading-snug text-slate-400">{x.description}</span>}
                      <span className="mt-auto text-[9px] text-slate-500">
                        {x.earned_on ? parseDate(x.earned_on).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" }) : x.when_text}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      {tab === "fortschritt" && (
        <>
          <Progress />
          <Measurements />
        </>
      )}
    </div>
  );
}
