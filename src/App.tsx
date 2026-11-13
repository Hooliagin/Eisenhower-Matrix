import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isoDate } from "./lib/dates";
import { clearCache } from "./lib/live";
import { connectRealtime, disconnectRealtime, fire, supabase } from "./lib/supabase";
import { RestTimerProvider } from "./lib/timer";
import Login from "./components/Login";
import Home from "./components/Home";
import RestTimerBar from "./components/RestTimerBar";
import Icon, { type IconName } from "./components/ui/Icon";
import Rewards from "./components/Rewards";
import { SheetHost } from "./components/ui/Sheet";

// Only the start page is in the first bundle; the other tabs load on demand (and are cached by the service worker).
const TAB_CHUNKS = {
  tasks: () => import("./components/Tasks"),
  projects: () => import("./components/Projects"),
  calendar: () => import("./components/Calendar"),
  elements: () => import("./components/Elements"),
  fitness: () => import("./components/fitness/Fitness"),
};
const Tasks = lazy(TAB_CHUNKS.tasks);
const Projects = lazy(TAB_CHUNKS.projects);
const Calendar = lazy(TAB_CHUNKS.calendar);
const Elements = lazy(TAB_CHUNKS.elements);
const Fitness = lazy(TAB_CHUNKS.fitness);

export type Tab = "today" | "tasks" | "projects" | "calendar" | "fitness" | "elements";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "today", label: "Heute", icon: "today" },
  { id: "tasks", label: "Aufgaben", icon: "tasks" },
  { id: "projects", label: "Projekte", icon: "projects" },
  { id: "calendar", label: "Kalender", icon: "calendar" },
  { id: "fitness", label: "Fitness", icon: "fitness" },
  { id: "elements", label: "Elemente", icon: "elements" },
];

function readTab(): Tab {
  const h = location.hash.replace("#", "").split("/")[0] as Tab;
  return TABS.some((t) => t.id === h) ? h : "today";
}

/** A crash in one tab must not blank the whole app: show what happened and offer a way back. */
class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card mx-auto mt-16 max-w-sm p-5 text-center">
        <p className="font-pixel text-lg text-amber-300">Da ist etwas schiefgelaufen</p>
        <p className="mt-2 break-words text-xs text-slate-400">{this.state.error.message}</p>
        <button className="btn-primary mt-4" onClick={() => location.reload()}>
          Neu laden
        </button>
        <p className="mt-3 text-[11px] text-slate-500">Deine Daten sind sicher gespeichert. Sag Claude im Chat kurz Bescheid, was du gerade gemacht hast.</p>
      </div>
    );
  }
}

function TabFallback() {
  return (
    <div className="flex flex-col gap-3 pt-6">
      <div className="skeleton h-10 w-2/3" />
      <div className="skeleton h-28" />
      <div className="skeleton h-28" />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [owner, setOwner] = useState<boolean | null>(() => {
    // Remember that this device belongs to the owner, so a cold start can paint right away (the server still decides).
    try {
      return localStorage.getItem("is-owner") === "1" ? true : null;
    } catch {
      return null;
    }
  });
  const [tab, setTab] = useState<Tab>(readTab);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") {
        clearCache();
        disconnectRealtime();
        try {
          localStorage.removeItem("is-owner");
        } catch {
          /* storage unavailable */
        }
      }
    });
    const onHash = () => setTab(readTab());
    window.addEventListener("hashchange", onHash);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (session === undefined) return;
    if (!userId) return setOwner(null);
    supabase
      .from("allowed_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return; // offline: keep what we knew
        setOwner(!!data);
        try {
          localStorage.setItem("is-owner", data ? "1" : "0");
        } catch {
          /* storage unavailable */
        }
        if (data) {
          connectRealtime();
          // Today's routine tasks (idempotent on the server).
          fire(supabase.rpc("spawn_routine_tasks", { d: isoDate() }));
          // Vergessenes „Training abschließen“ nachholen (letzter Satz > 90 min her oder Vortag).
          fire(supabase.rpc("autofinish_sessions"));
        }
      });
  }, [userId, session === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once the start page is up, fetch the other tabs in the background: switching is instant and,
  // because the service worker keeps what was fetched, every tab also opens without network.
  useEffect(() => {
    if (!owner) return;
    const id = setTimeout(() => Object.values(TAB_CHUNKS).forEach((load) => void load().catch(() => {})), 2500);
    return () => clearTimeout(id);
  }, [owner]);

  // Each tab starts at the top; going back to a tab you were on keeps the browser's own scroll restoration out of the way.
  useEffect(() => {
    window.scrollTo(0, 0); // (newer browsers return a promise here – never return it from an effect)
  }, [tab]);

  const go = (t: Tab) => {
    if (t === tab && location.hash.replace("#", "") === t) return void window.scrollTo({ top: 0, behavior: "smooth" });
    location.hash = t;
    setTab(t);
  };

  if (session === undefined) return null;
  if (!session) return <Login />;
  if (owner === null) return null;
  if (!owner)
    return (
      <div className="mx-auto max-w-md p-6 pt-20 text-center">
        <h1 className="mb-2 text-xl font-semibold">Fast geschafft</h1>
        <p className="text-slate-400">
          Dein Konto ist angelegt, aber noch nicht freigeschaltet. Sag Claude im Chat Bescheid, dann wird es aktiviert.
        </p>
        <p className="mt-4 break-all font-mono text-xs text-slate-500">{session.user.id}</p>
        <button className="btn-ghost mt-6" onClick={() => supabase.auth.signOut()}>
          Abmelden
        </button>
      </div>
    );

  const index = TABS.findIndex((t) => t.id === tab);

  return (
    <RestTimerProvider>
      <div className="pt-safe mx-auto min-h-screen max-w-5xl px-3 pb-32 sm:px-6">
        <ErrorBoundary resetKey={tab}>
          <Suspense fallback={<TabFallback />}>
            {tab === "today" && <Home />}
            {tab === "tasks" && <Tasks />}
            {tab === "projects" && <Projects />}
            {tab === "calendar" && <Calendar />}
            {tab === "fitness" && <Fitness />}
            {tab === "elements" && <Elements />}
          </Suspense>
        </ErrorBoundary>
      </div>
      <RestTimerBar />
      <Rewards />
      <SheetHost />
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}>
        <div
          className="pointer-events-auto relative mx-auto flex max-w-md rounded-[22px] border border-white/10 bg-slate-900/80 p-1 shadow-lift backdrop-blur-xl"
          style={{ WebkitBackdropFilter: "blur(24px) saturate(1.4)" }}
        >
          <span
            aria-hidden
            className="absolute bottom-1 top-1 rounded-[18px] bg-white/[0.07] transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.2,1)]"
            style={{ left: 4, width: `calc((100% - 8px) / ${TABS.length})`, transform: `translateX(${index * 100}%)` }}
          />
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${active ? "text-white" : "text-slate-500"}`}
              >
                <Icon name={t.icon} size={22} style={active ? { color: "var(--accent)", filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 70%, transparent))" } : undefined} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </RestTimerProvider>
  );
}
