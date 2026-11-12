import { useMemo, useState } from "react";
import { ACTIVE_XP, fmtMetric, streak, useActivity, useElements, useNutritionHistory, useProgress, useSessions, xpByDay, type XpEvent } from "../lib/data";
import { ATTR_ORDER, ATTRS, balance, ELEMENT_ORDER, ELEMENTS, type Attribute, type Element } from "../lib/character";
import { addDays, isoDate, isoWeek, parseDate, WEEKDAY_SHORT, weekStart } from "../lib/dates";
import { fmtMinutes } from "../lib/schedule";
import Icon from "./ui/Icon";

// Sequential ramp for "how much happened that day": one hue (amber), dark → bright on the night surface.
const HEAT = ["rgba(148,163,196,0.10)", "#4a3410", "#8a5a0c", "#d08a0e", "#fbbf24", "#fde68a"];
const heatStep = (xp: number) => (xp < ACTIVE_XP ? 0 : xp < 40 ? 1 : xp < 90 ? 2 : xp < 160 ? 3 : xp < 260 ? 4 : 5);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const dm = (iso: string) => `${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}.`;

/** One horizontal bar: this week's value, a tick for last week and (optionally) the goal. Values are written out – never colour alone. */
function Row({ icon, label, value, prev, goal, max, color, unit }: { icon: string; label: string; value: number; prev: number; goal?: number; max: number; color: string; unit: string }) {
  const pct = (v: number) => `${Math.min(100, (v / Math.max(1, max)) * 100)}%`;
  const reached = goal != null && value >= goal;
  return (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 py-1">
      <span className="truncate text-xs text-slate-300">
        {icon} {label}
      </span>
      <div className="relative h-2.5 rounded-r-[4px] bg-white/[0.06]">
        <div className="bar-fill absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: pct(value), background: color, minWidth: value > 0 ? 3 : 0 }} />
        {prev > 0 && <span className="absolute -inset-y-0.5 w-0.5 rounded-full bg-slate-300/70" style={{ left: pct(prev) }} title={`Vorwoche ${prev}`} />}
        {goal != null && <span className="absolute -inset-y-1 w-px bg-white/40" style={{ left: pct(goal) }} />}
      </div>
      <span className="w-[5.2rem] text-right font-pixel text-[11px] text-slate-200">
        {unit === "min" ? fmtMinutes(value) : value}
        {goal != null && <span className="text-slate-500"> / {goal}</span>}
        {reached && <span className="text-emerald-400"> ✓</span>}
      </span>
    </div>
  );
}

/** 16 weeks of days, GitHub style. Tap a day to read what happened. */
export function Heatmap({ events, today, onPick, picked }: { events: XpEvent[]; today: string; onPick?: (day: string) => void; picked?: string | null }) {
  const by = useMemo(() => xpByDay(events), [events]);
  const first = addDays(weekStart(), -7 * 15);
  const weeks = Array.from({ length: 16 }, (_, w) => Array.from({ length: 7 }, (_, d) => isoDate(addDays(first, w * 7 + d))));
  return (
    <div>
      <div className="flex gap-[3px]">
        <div className="flex flex-col gap-[3px] pr-1 text-[9px] leading-[14px] text-slate-600">
          {WEEKDAY_SHORT.map((d, i) => (
            <span key={d} className="h-[14px]">
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>
        {weeks.map((days) => (
          <div key={days[0]} className="flex flex-1 flex-col gap-[3px]">
            {days.map((day) => {
              const xp = by.get(day) ?? 0;
              const future = day > today;
              return (
                <button
                  key={day}
                  disabled={future || !onPick}
                  onClick={() => onPick?.(day)}
                  aria-label={`${dm(day)} ${xp} XP`}
                  className={`h-[14px] w-full rounded-[3px] ${picked === day ? "ring-2 ring-white" : day === today ? "ring-1 ring-white/50" : ""}`}
                  style={{ background: future ? "transparent" : HEAT[heatStep(xp)] }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-500">
        weniger
        {HEAT.map((c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
        ))}
        mehr
      </div>
    </div>
  );
}

/** The week in numbers – what grew, what was neglected, and one honest suggestion for the next one. */
export default function WeekReview({ onClose }: { onClose: () => void }) {
  const { data: events } = useActivity();
  const { data: elementEvents } = useElements();
  const { data: progress } = useProgress();
  const { data: sessions } = useSessions();
  const { data: nutrition } = useNutritionHistory();
  const today = isoDate();
  const [offset, setOffset] = useState(0); // 0 = this week, -1 = last week …
  const [picked, setPicked] = useState<string | null>(null);

  const monday = addDays(weekStart(), offset * 7);
  const from = isoDate(monday);
  const to = isoDate(addDays(monday, 6));
  const prevFrom = isoDate(addDays(monday, -7));
  const inWeek = (d: string) => d >= from && d <= to;
  const inPrev = (d: string) => d >= prevFrom && d < from;

  const week = events.filter((e) => inWeek(e.day));
  const prev = events.filter((e) => inPrev(e.day));
  const total = sum(week.map((e) => Number(e.xp)));
  const totalPrev = sum(prev.map((e) => Number(e.xp)));
  const byDay = xpByDay(week);
  const days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(monday, i)));
  const elapsed = days.filter((d) => d <= today).length;
  const activeDays = days.filter((d) => (byDay.get(d) ?? 0) >= ACTIVE_XP).length;
  const st = streak(events, today);

  const attr = (list: XpEvent[], a: Attribute) => sum(list.filter((e) => e.attribute === a).map((e) => Number(e.xp)));
  const attrMax = Math.max(...ATTR_ORDER.map((a) => Math.max(attr(week, a), attr(prev, a), ATTRS[a].weeklyTarget)));

  const el = (f: (d: string) => boolean) => Object.fromEntries(ELEMENT_ORDER.map((e) => [e, sum(elementEvents.filter((x) => x.element === e && f(x.day)).map((x) => Number(x.minutes)))])) as Record<Element, number>;
  const elWeek = el(inWeek);
  const elPrev = el(inPrev);
  const elMax = Math.max(60, ...ELEMENT_ORDER.map((e) => Math.max(elWeek[e], elPrev[e])));
  const B = balance(elWeek);

  // biggest contributors, same activity summed up
  const top = [...week.reduce((m, e) => m.set(e.label, { xp: (m.get(e.label)?.xp ?? 0) + Number(e.xp), n: (m.get(e.label)?.n ?? 0) + 1, a: e.attribute }), new Map<string, { xp: number; n: number; a: string }>())]
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, 5);

  const trainings = sessions.filter((s) => s.finished_at && inWeek(s.session_date)).length;
  const records = progress.filter((m) => m.is_record && inWeek(m.latest_day));
  const fed = nutrition.filter((n) => inWeek(n.day) && n.day <= today && n.kcal_in > 0);
  const avg = (f: (n: (typeof fed)[number]) => number) => Math.round(sum(fed.map(f)) / Math.max(1, fed.length));

  // plain-language summary: honest, no sermon
  const ranked = [...ATTR_ORDER].sort((a, b) => attr(week, b) - attr(week, a));
  const neglected = ATTR_ORDER.filter((a) => attr(week, a) < ATTRS[a].weeklyTarget * 0.25);
  const reached = ATTR_ORDER.filter((a) => attr(week, a) >= ATTRS[a].weeklyTarget);
  const current = offset === 0;
  const pickedEvents = picked ? events.filter((e) => e.day === picked) : [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
      <div className="page mx-auto flex max-w-md flex-col gap-3 px-3">
        <header className="flex items-center gap-2">
          <button className="btn-ghost h-10 w-10 p-0" onClick={onClose} aria-label="Schließen">
            <Icon name="close" size={18} />
          </button>
          <h1 className="flex-1 text-xl">Wochenrückblick</h1>
          <button className="btn-ghost h-9 w-9 p-0 disabled:opacity-30" disabled={offset <= -15} onClick={() => setOffset(offset - 1)} aria-label="Woche zurück">
            <Icon name="back" size={16} />
          </button>
          <span className="w-[5.4rem] text-center font-pixel text-xs text-slate-300">
            KW {isoWeek(monday)}
            <span className="block text-[10px] text-slate-500">
              {dm(from)}–{dm(to)}
            </span>
          </span>
          <button className="btn-ghost h-9 w-9 p-0 disabled:opacity-30" disabled={current} onClick={() => setOffset(offset + 1)} aria-label="Woche vor">
            <Icon name="chevron" size={16} />
          </button>
        </header>

        <section className="card p-4">
          <p className="label">{current ? "Diese Woche bisher" : "Gesammelt"}</p>
          <div className="mt-1 flex items-end justify-between">
            <span className="font-pixel text-5xl leading-none text-amber-300">
              {total.toLocaleString("de-DE")}
              <span className="ml-1 text-lg text-amber-200/70">XP</span>
            </span>
            {totalPrev > 0 && (
              <span className={`text-right text-xs ${total >= totalPrev ? "text-emerald-400" : "text-slate-400"}`}>
                {total >= totalPrev ? "▲" : "▼"} {Math.abs(Math.round(((total - totalPrev) / totalPrev) * 100))} %
                <span className="block text-[10px] text-slate-500">Vorwoche {totalPrev.toLocaleString("de-DE")}{current && elapsed < 7 ? " (ganze Woche)" : ""}</span>
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {days.map((d, i) => {
              const xp = byDay.get(d) ?? 0;
              const future = d > today;
              return (
                <div key={d} className="flex flex-col items-center gap-1">
                  <span className={`grid h-9 w-full place-items-center rounded-lg font-pixel text-[11px] ${future ? "border border-dashed border-white/10 text-slate-700" : xp >= ACTIVE_XP ? "text-slate-950" : "text-slate-600"}`} style={future ? undefined : { background: HEAT[heatStep(xp)] }}>
                    {future ? "" : xp || "–"}
                  </span>
                  <span className={`text-[10px] ${d === today ? "font-semibold text-white" : "text-slate-500"}`}>{WEEKDAY_SHORT[i]}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            <b className="text-slate-200">{activeDays}</b> von {elapsed} Tagen aktiv
            {current && (
              <>
                {" "}· Serie <b className="text-slate-200">{st.days}</b> {st.days === 1 ? "Tag" : "Tage"}
                {!st.todayDone && st.days > 0 && <span className="text-amber-300"> (heute noch offen)</span>} · Bestwert {st.best}
              </>
            )}
          </p>
        </section>

        <section className="card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base">XP nach Wert</h2>
            <span className="text-[10px] text-slate-500">┃ Vorwoche · │ Wochenziel</span>
          </div>
          <div className="mt-2">
            {ATTR_ORDER.map((a) => (
              <Row key={a} icon={ATTRS[a].emoji} label={ATTRS[a].label} value={attr(week, a)} prev={attr(prev, a)} goal={ATTRS[a].weeklyTarget} max={attrMax} color={ATTRS[a].color} unit="XP" />
            ))}
          </div>
        </section>

        <section className="card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base">Elemente</h2>
            <span className="font-pixel text-xs text-violet-300">☯ Harmonie {B.total >= 60 ? B.harmony : "–"}</span>
          </div>
          <div className="mt-2">
            {ELEMENT_ORDER.map((e) => (
              <Row key={e} icon={ELEMENTS[e].emoji} label={ELEMENTS[e].label} value={elWeek[e]} prev={elPrev[e]} max={elMax} color={ELEMENTS[e].color} unit="min" />
            ))}
          </div>
          {B.total >= 60 && (
            <p className="mt-2 text-[11px] text-slate-400">
              {B.harmony >= 85 ? "Sehr ausgeglichen – ab 300 min gibt das +100 Bonus-XP." : B.harmony >= 70 ? "Gut verteilt – ab 300 min gibt das +50 Bonus-XP." : `Am wenigsten: ${ELEMENTS[B.weakest].emoji} ${ELEMENTS[B.weakest].label}. Idee: ${ELEMENTS[B.weakest].ideas.split(",")[0]}.`}
            </p>
          )}
        </section>

        {top.length > 0 && (
          <section className="card p-4">
            <h2 className="text-base">Das hat am meisten gebracht</h2>
            <ol className="mt-2 flex flex-col gap-1.5">
              {top.map(([label, v], i) => (
                <li key={label} className="flex items-center gap-2 text-xs">
                  <span className="w-4 font-pixel text-slate-500">{i + 1}</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ATTRS[v.a as Attribute]?.color ?? "#94a3b8" }} />
                  <span className="min-w-0 flex-1 truncate text-slate-200">
                    {label}
                    {v.n > 1 && <span className="text-slate-500"> · {v.n}×</span>}
                  </span>
                  <span className="font-pixel text-slate-300">{v.xp} XP</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="card grid grid-cols-3 gap-2 p-4 text-center">
          <div>
            <div className="font-pixel text-2xl text-slate-100">{trainings}</div>
            <div className="text-[10px] text-slate-500">Trainings</div>
          </div>
          <div>
            <div className="font-pixel text-2xl text-slate-100">{fed.length ? avg((n) => n.protein_effective_g) : "–"}</div>
            <div className="text-[10px] text-slate-500">Ø g Protein{fed.length ? ` (${fed.length} T.)` : ""}</div>
          </div>
          <div>
            <div className="font-pixel text-2xl text-slate-100">{fed.length ? (avg((n) => n.fluid_ml) / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–"}</div>
            <div className="text-[10px] text-slate-500">Ø Liter getrunken</div>
          </div>
          {fed.length > 0 && (
            <p className="col-span-3 mt-1 text-left text-[11px] text-slate-400">
              Essen an {fed.length} {fed.length === 1 ? "Tag" : "Tagen"} eingetragen: Ø {avg((n) => n.kcal_in)} von {avg((n) => n.burn_base + n.burn_activity + (n.kcal_surplus ?? 0))} kcal, Protein-Ziel an{" "}
              {fed.filter((n) => n.protein_effective_g >= n.protein_target_g).length}/{fed.length} Tagen.
            </p>
          )}
          {records.length > 0 && (
            <p className="col-span-3 text-left text-[11px] text-amber-300">
              🏆 Bestleistungen: {records.map((m) => `${m.label.replace(" (e1RM)", "")} ${fmtMetric(m.latest, m.unit)}`).join(" · ")}
            </p>
          )}
        </section>

        <section className="card p-4">
          <h2 className="text-base">16 Wochen</h2>
          <p className="mb-3 text-[11px] text-slate-500">Jedes Kästchen ein Tag. Antippen zeigt, was los war.</p>
          <Heatmap events={events} today={today} picked={picked} onPick={(d) => setPicked(picked === d ? null : d)} />
          {picked && (
            <div className="mt-2 rounded-xl bg-white/[0.05] p-2.5 text-xs">
              <b>
                {parseDate(picked).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })} · {sum(pickedEvents.map((e) => Number(e.xp)))} XP
              </b>
              <ul className="mt-1 flex flex-col gap-0.5 text-slate-400">
                {pickedEvents.map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">
                      {ATTRS[e.attribute as Attribute]?.emoji} {e.label}
                    </span>
                    <span className="font-pixel text-slate-300">{e.xp}</span>
                  </li>
                ))}
                {!pickedEvents.length && <li>Ruhetag – nichts eingetragen.</li>}
              </ul>
            </div>
          )}
        </section>

        <section className="card p-4 text-sm leading-relaxed">
          <h2 className="text-base">Fazit</h2>
          {total === 0 ? (
            <p className="mt-1 text-slate-300">Diese Woche ist noch nichts eingetragen. Ein Daily von 10 Minuten reicht, um die Insel wieder in Bewegung zu bringen.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1.5 text-slate-300">
              <li>
                Am meisten ging in <b style={{ color: ATTRS[ranked[0]].color }}>{ATTRS[ranked[0]].emoji} {ATTRS[ranked[0]].label}</b> ({attr(week, ranked[0])} XP).
                {reached.length > 0 && <> Wochenziel erreicht bei: {reached.map((a) => ATTRS[a].label).join(", ")}.</>}
              </li>
              {neglected.length > 0 && (
                <li>
                  Kaum etwas kam bei {neglected.map((a) => `${ATTRS[a].emoji} ${ATTRS[a].label}`).join(", ")} an. {neglected.length < 6 && `Für ${ATTRS[neglected[0]].label} zählt: ${ATTRS[neglected[0]].how}.`}
                </li>
              )}
              {activeDays < Math.min(elapsed, 4) && <li>Nur {activeDays} aktive Tage. Der kleinste Hebel: jeden Tag ein Daily, egal welches.</li>}
              {totalPrev > 0 && !current && <li>{total >= totalPrev ? `Mehr als in der Woche davor (+${total - totalPrev} XP).` : `Weniger als in der Woche davor (−${totalPrev - total} XP).`}</li>}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
