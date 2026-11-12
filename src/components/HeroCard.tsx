import { useEffect, useState } from "react";
import { useCharacter } from "../lib/data";
import { ATTR_ORDER, ATTRS, balance, characterLevel, creditTier, EFFECT_NAMES, ELEMENT_LINKS, ELEMENT_ORDER, ELEMENTS, trend, type Element } from "../lib/character";
import WorldView, { use3D, type Hit } from "../world/WorldView";
import { levels, questOfDay, TodayRecords } from "./Character";
import { PouchiPanel } from "./Pouchi";
import Icon from "./ui/Icon";

/** The start page's centrepiece: the living island with a game HUD, the six attributes and today's quest. */
export default function HeroCard() {
  const { data, loading } = useCharacter();
  const L = levels(data.summary, data.skills);
  const B = balance(data.elements7);
  const bonus = data.harmonyWeeks.reduce((s, w) => s + w.bonus_xp, 0);
  const totalXp = ATTR_ORDER.reduce((s, a) => s + L[a].xp, 0) + bonus;
  const C = characterLevel(totalXp);
  const credits = data.meta?.credits ?? 0;
  const [mode3d, setMode3d] = use3D();
  const [focus, setFocus] = useState<Element | null>(null);
  const [pouchi, setPouchi] = useState(false);

  const debuffed = ELEMENT_ORDER.find((e) => B.effects[e] === "debuff");
  const skillQuest = questOfDay(data.skills);
  const quest = debuffed
    ? { label: EFFECT_NAMES[debuffed].debuff, text: `${ELEMENTS[debuffed].label} stärken: ${ELEMENTS[debuffed].ideas.split(",")[0]}`, warn: true }
    : skillQuest && { label: "Quest", text: skillQuest.next_step ?? "", warn: false };

  useEffect(() => {
    if (!focus) return;
    const id = setTimeout(() => setFocus(null), 6000);
    return () => clearTimeout(id);
  }, [focus]);

  function onTap(hit: Hit) {
    if (hit === "hero") location.hash = "today/character";
    else if (hit === "dog") setTimeout(() => setPouchi(true), 650);
    else setFocus(hit);
  }

  const ready = !loading && data.skills.length > 0;
  return (
    <section className="card overflow-hidden">
      <WorldView balance={B} enabled={mode3d} onTap={onTap} className="h-[min(78vw,340px)]">
        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/45 to-transparent p-3 pb-8">
          <div>
            <div className="font-pixel text-xl leading-none text-white drop-shadow">JOSHUA</div>
            <div className="mt-0.5 font-pixel text-[11px] text-amber-200/90 drop-shadow">{data.meta?.class_title ?? "Abenteurer"}</div>
          </div>
          <div className="text-right">
            <div className="font-pixel text-2xl leading-none text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,.55)]">LV {ready ? C.level : "–"}</div>
          </div>
        </div>
        <button
          className="absolute right-2 top-12 rounded-full bg-black/35 p-1.5 text-white/70 backdrop-blur"
          onClick={() => setMode3d(!mode3d)}
          aria-label={mode3d ? "3D ausschalten" : "3D einschalten"}
          title={mode3d ? "3D aus (spart Akku)" : "3D an"}
        >
          <Icon name="cube" size={16} style={{ opacity: mode3d ? 1 : 0.45 }} />
        </button>

        {focus && (
          <button
            className="absolute inset-x-3 bottom-10 animate-pop rounded-xl border border-white/15 bg-slate-950/80 p-2.5 text-left backdrop-blur"
            onClick={() => (location.hash = "elements")}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-pixel text-sm" style={{ color: ELEMENTS[focus].color }}>
                {ELEMENTS[focus].emoji} {ELEMENTS[focus].label} · {Math.round(B.shares[focus] * 100)} %
              </span>
              <span className={`font-pixel text-[11px] ${B.effects[focus] === "buff" ? "text-amber-300" : B.effects[focus] === "debuff" ? "text-red-300" : "text-slate-400"}`}>
                {B.effects[focus] === "buff" ? `▲ ${EFFECT_NAMES[focus].buff}` : B.effects[focus] === "debuff" ? `▼ ${EFFECT_NAMES[focus].debuff}` : "ausgeglichen"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-300">
              {B.effects[focus] === "debuff"
                ? `Kommt zu kurz. Idee: ${ELEMENTS[focus].ideas.split(",")[0]}.`
                : `${ELEMENTS[focus].stands.split(" – ")[0]}. Wirkt auf ${ELEMENT_LINKS[focus].length ? ELEMENT_LINKS[focus].map((a) => ATTRS[a].label).join(" & ") : "alle Werte"}.`}{" "}
              <span className="text-slate-500">Details ›</span>
            </p>
          </button>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2.5 pt-8">
          <div className="flex items-center gap-2 font-pixel text-[11px]">
            <span className="text-amber-300">XP</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div className="bar-fill h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${ready ? Math.max(2, C.pct * 100) : 0}%` }} />
            </div>
            <span className="text-white/80">{ready ? `${C.toNext} → LV ${C.level + 1}` : ""}</span>
          </div>
        </div>
      </WorldView>

      <button className="block w-full p-3 text-left" onClick={() => (location.hash = "today/character")}>
        <div className="grid grid-cols-6 gap-1.5">
          {ATTR_ORDER.map((a) => {
            const t = trend(L[a].s);
            return (
              <div key={a} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.04] px-1 py-1.5">
                <span className="text-base leading-none">{ATTRS[a].emoji}</span>
                <span className="font-pixel text-sm leading-none" style={{ color: ATTRS[a].color }}>
                  {ready ? L[a].level : "–"}
                  <span className={`ml-0.5 align-top text-[7px] ${t === "up" ? "text-emerald-400" : t === "down" ? "text-red-400" : "text-transparent"}`}>{t === "down" ? "▼" : "▲"}</span>
                </span>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="bar-fill h-full rounded-full" style={{ width: `${ready ? Math.max(6, L[a].pct * 100) : 0}%`, background: ATTRS[a].color }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex gap-1.5 font-pixel text-[11px]">
          <span className="flex flex-1 items-center gap-1.5 rounded-lg bg-violet-500/10 px-2 py-1.5 text-violet-200">
            ☯ Harmonie <b className="text-violet-100">{B.harmony}</b>
            <span className="ml-auto text-[10px] text-slate-300">
              {ELEMENT_ORDER.filter((e) => B.effects[e] !== "neutral")
                .map((e) => `${B.effects[e] === "buff" ? "▲" : "▼"}${ELEMENTS[e].emoji}`)
                .join(" ")}
            </span>
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-emerald-200">
            ₵ <b className="text-emerald-100">{credits}</b> {creditTier(credits)}
          </span>
        </div>

        {quest && (
          <div className={`mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${quest.warn ? "border-red-400/25 bg-red-500/10" : "border-amber-300/20 bg-amber-400/[0.07]"}`}>
            <span className={`font-pixel uppercase ${quest.warn ? "text-red-300" : "text-amber-300"}`}>▶ {quest.label}</span>
            <span className="flex-1 leading-snug text-slate-200">{quest.text}</span>
          </div>
        )}
        <TodayRecords />
      </button>
      {pouchi && <PouchiPanel onClose={() => setPouchi(false)} />}
    </section>
  );
}
