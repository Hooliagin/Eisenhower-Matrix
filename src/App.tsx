import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { RestTimerProvider } from "./lib/timer";
import Login from "./components/Login";
import Home from "./components/Home";
import Tasks from "./components/Tasks";
import Projects from "./components/Projects";
import Calendar from "./components/Calendar";
import Fitness from "./components/fitness/Fitness";
import RestTimerBar from "./components/RestTimerBar";

export type Tab = "today" | "tasks" | "projects" | "calendar" | "fitness";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Heute", icon: "☀️" },
  { id: "tasks", label: "Aufgaben", icon: "✓" },
  { id: "projects", label: "Projekte", icon: "📁" },
  { id: "calendar", label: "Kalender", icon: "📅" },
  { id: "fitness", label: "Fitness", icon: "🏋️" },
];

function readTab(): Tab {
  const h = location.hash.replace("#", "").split("/")[0] as Tab;
  return TABS.some((t) => t.id === h) ? h : "today";
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [owner, setOwner] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(readTab);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const onHash = () => setTab(readTab());
    window.addEventListener("hashchange", onHash);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  useEffect(() => {
    if (!session) return setOwner(null);
    supabase
      .from("allowed_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setOwner(!!data));
  }, [session]);

  const go = (t: Tab) => {
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

  return (
    <RestTimerProvider>
      <div className="pt-safe mx-auto min-h-screen max-w-5xl px-3 pb-32 sm:px-6">
        {tab === "today" && <Home />}
        {tab === "tasks" && <Tasks />}
        {tab === "projects" && <Projects />}
        {tab === "calendar" && <Calendar />}
        {tab === "fitness" && <Fitness />}
      </div>
      <RestTimerBar />
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-[#0b0f17]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${tab === t.id ? "text-white" : "text-slate-500"}`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </RestTimerProvider>
  );
}
