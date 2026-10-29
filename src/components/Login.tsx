import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Konto angelegt. Sag Claude Bescheid, dann wird es freigeschaltet – danach einloggen.");
  }

  return (
    <div className="mx-auto max-w-sm px-6 pt-24">
      <div className="mb-8 text-center">
        <img src="/icon.svg" alt="" className="mx-auto mb-3 h-14 w-14" />
        <h1 className="text-2xl font-semibold">Daily</h1>
        <p className="text-sm text-slate-400">Aufgaben · Kalender · Training</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input type="email" autoComplete="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        <button className="btn-primary py-3" disabled={busy}>
          {mode === "in" ? "Einloggen" : "Konto anlegen"}
        </button>
        {msg && <p className="text-center text-sm text-slate-300">{msg}</p>}
        <button type="button" className="text-sm text-slate-500" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Erstes Mal? Konto anlegen" : "Zurück zum Login"}
        </button>
      </form>
    </div>
  );
}
