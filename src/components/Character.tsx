import { useState } from "react";
import { fmtMetric, streak, useActivity, useCharacter, useProgress, type MetricProgress } from "../lib/data";
import WorldView, { use3D } from "../world/WorldView";
import { Heatmap } from "./WeekReview";
import { isoDate, parseDate } from "../lib/dates";
import { byMetric, useMeasurements } from "./fitness/BodyValues";
import {
  ATTR_ORDER,
  ATTRS,
  backgroundXp,
  balance,
  characterLevel,
  EFFECT_NAMES,
  effectiveForm,
  ELEMENT_LINKS,
  ELEMENT_ORDER,
  ELEMENTS,
  formMultiplier,
  type Balance,
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

export type Leveled = { s: AttrSummary; bg: number; xp: number; level: number; pct: number; toNext: number };

/** Attribute levels from activity XP plus background XP (skills you already had before the app). */
export function levels(summary: AttrSummary[], skills: Skill[]) {
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
export function PixelBar({ pct, color, segments = 12 }: { pct: number; color: string; segments?: number }) {
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

/** The four elements as orbs: fill = share of the last 7 days, ring = buff (gold) / debuff (red). */
function ElementOrbs({ b, size = 22 }: { b: Balance; size?: number }) {
  return (
    <div className="flex gap-1.5">
      {ELEMENT_ORDER.map((e) => {
        const eff = b.effects[e];
        const fill = Math.min(1, b.shares[e] / 0.4);
        return (
          <span
            key={e}
            title={`${ELEMENTS[e].label} ${Math.round(b.shares[e] * 100)} %`}
            className="relative grid place-items-center overflow-hidden rounded-full"
            style={{
              width: size,
              height: size,
              background: "#0f172a",
              boxShadow: `0 0 0 2px ${eff === "buff" ? "#fbbf24" : eff === "debuff" ? "#ef4444" : "#334155"}`,
            }}
          >
            <span className="absolute inset-x-0 bottom-0" style={{ height: `${fill * 100}%`, background: ELEMENTS[e].color, opacity: 0.55 }} />
            <span className="relative text-[11px] leading-none">{ELEMENTS[e].emoji}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Balance details: harmony, the active buffs/debuffs and what they do. Shared by the character view and the Elements tab. */
export function BalancePanel({ b, bonusTotal, thisWeek }: { b: Balance; bonusTotal: number; thisWeek?: number }) {
  return (
    <section className="pixel-frame bg-slate-900/80 p-3" style={{ ["--glow" as string]: "#a78bfa44" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">☯ Balance</h2>
        <ElementOrbs b={b} size={26} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="w-20 font-pixel text-violet-300">Harmonie {b.harmony}</span>
        <div className="flex-1">
          <PixelBar pct={b.harmony / 100} color="#a78bfa" segments={20} />
        </div>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-[11px]">
        {ELEMENT_ORDER.filter((e) => b.effects[e] !== "neutral").map((e) => {
          const buff = b.effects[e] === "buff";
          const targets = ELEMENT_LINKS[e].length ? ELEMENT_LINKS[e].map((a) => ATTRS[a].label).join(" & ") : "alle Werte";
          return (
            <li key={e} className={buff ? "text-amber-200" : "text-red-300"}>
              {ELEMENTS[e].emoji} <b className="font-pixel">{buff ? "▲" : "▼"} {EFFECT_NAMES[e][buff ? "buff" : "debuff"]}</b>{" "}
              <span className="text-slate-400">
                ({Math.round(b.shares[e] * 100)} %) · Form {targets} {buff ? (e === "erde" ? "+5 %" : "+15 %") : e === "erde" ? "−10 %" : "−15 %"}
              </span>
            </li>
          );
        })}
        {ELEMENT_ORDER.every((e) => b.effects[e] === "neutral") && (
          <li className="text-slate-500">{b.total < 60 ? "Noch zu wenig Aktivität in den letzten 7 Tagen." : "Keine Effekte aktiv – alles im Mittelfeld."}</li>
        )}
      </ul>
      <p className="mt-2 text-[10px] leading-snug text-slate-500">
        Letzte 7 Tage. Ab 22 % Anteil wird ein Element zum Buff, unter 10 % zum Debuff. Erde ist dein Fundament und wirkt auf alles.
        Abgeschlossene Wochen mit Harmonie ≥ 70 (ab 300 min) bringen Bonus-XP: +50, ab 85 +100.
        {thisWeek != null && ` Diese Woche bisher: Harmonie ${thisWeek}.`} {bonusTotal > 0 && `Bisher verdient: ${bonusTotal} Bonus-XP.`}
      </p>
    </section>
  );
}

/** Pick a quest of the day from the skills' next steps (rotates daily). */
export function questOfDay(skills: Skill[]): Skill | null {
  const q = skills.filter((s) => s.next_step);
  if (!q.length) return null;
  const day = Math.floor(Date.now() / 86_400_000);
  return q[day % q.length];
}

/** Today's new personal bests – one quiet line on the home card, only when there is something. */
export function TodayRecords() {
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
  const B = balance(data.elements7);
  const bonus = data.harmonyWeeks.reduce((s, w) => s + w.bonus_xp, 0);
  const totalXp = ATTR_ORDER.reduce((s, a) => s + L[a].xp, 0) + bonus;
  const C = characterLevel(totalXp);
  const [tab, setTab] = useState<Tab>("werte");
  const credits = data.meta?.credits ?? 0;
  const [mode3d] = use3D();
  const { data: activity } = useActivity();
  const st = streak(activity);

  return (
    <div className="page flex flex-col gap-4 pt-4">
      <header className="flex items-center gap-2">
        <button className="btn-ghost px-2" onClick={() => (location.hash = "today")}>‹</button>
        <h1 className="text-xl font-semibold">Charakter</h1>
      </header>

      <section className="card overflow-hidden">
        <WorldView balance={B} enabled={mode3d} view="portrait" className="h-64">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
            <div className="flex items-end justify-between">
              <div>
                <div className="font-pixel text-2xl leading-none text-white">JOSHUA</div>
                <div className="mt-0.5 font-pixel text-xs text-amber-200/90">{data.meta?.class_title ?? "Abenteurer"}</div>
              </div>
              <div className="font-pixel text-4xl leading-none text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,.55)]">LV {C.level}</div>
            </div>
          </div>
        </WorldView>
        <div className="flex flex-col gap-2 p-3">
          <div>
            <PixelBar pct={C.pct} color="#fbbf24" segments={24} />
            <p className="mt-1 text-[11px] text-slate-500">
              {totalXp.toLocaleString("de-DE")} XP{bonus ? ` (inkl. ${bonus} Harmonie-Bonus)` : ""} · noch {C.toNext} bis LV {C.level + 1}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 font-pixel text-xs text-emerald-300">
              ₵ {credits} · {creditTier(credits)}
            </span>
            <div className="flex-1">
              <PixelBar pct={credits / 100} color="#34d399" segments={16} />
            </div>
          </div>
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
          <button key={k} onClick={() => setTab(k)} className={`rounded-xl py-2 transition ${tab === k ? "bg-amber-400 text-slate-900" : "bg-white/[0.07] text-slate-300"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "werte" && (
        <>
          <BalancePanel b={B} bonusTotal={bonus} thisWeek={data.harmonyWeeks.find((w) => !w.complete)?.harmony} />
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
                  <Bar pct={effectiveForm(s, B.effects) / 100} color={ATTRS[a].color} />
                  <span className="w-10 whitespace-nowrap text-right">{effectiveForm(s, B.effects)} %</span>
                  <span className={`text-[10px] ${t === "up" ? "text-emerald-400" : t === "down" ? "text-red-400" : "text-slate-500"}`}>{TREND_ICON[t]}</span>
                </div>
                {formMultiplier(a, B.effects).sources.length > 0 && (
                  <p className="text-[10px]">
                    {formMultiplier(a, B.effects).sources.map((x) => (
                      <span key={x.element} className={`mr-2 ${x.pct > 0 ? "text-amber-300" : "text-red-300"}`}>
                        {ELEMENTS[x.element].emoji} {x.pct > 0 ? "+" : ""}
                        {x.pct} % {EFFECT_NAMES[x.element][x.pct > 0 ? "buff" : "debuff"]}
                      </span>
                    ))}
                    <span className="text-slate-600">(Grund-Form {form(s)} %)</span>
                  </p>
                )}
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
          <section className="card p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-300">🔥 Aktivität · 16 Wochen</h2>
              <span className="font-pixel text-xs text-slate-400">
                Serie {st.days} · Bestwert {st.best}
              </span>
            </div>
            <Heatmap events={activity} today={isoDate()} />
          </section>
          <Progress />
          <Measurements />
        </>
      )}
    </div>
  );
}
