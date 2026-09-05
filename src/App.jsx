import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import Auth from "./components/Auth.jsx";
import PickSheet from "./components/PickSheet.jsx";
import Leaderboard from "./components/Leaderboard.jsx";
import Rules from "./components/Rules.jsx";
import Admin from "./components/Admin.jsx";
import Swaps from "./components/Swaps.jsx";
import ResetPassword from "./components/ResetPassword.jsx";

const SEASON = 2026;

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [pool, setPool] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entryId, setEntryId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState("picks");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  // Set when someone arrives from a password reset email. Supabase puts
  // type=recovery in the URL and signs them in with a short-lived session,
  // so we must show the new-password screen instead of the normal app.
  const [recovering, setRecovering] = useState(
    () => window.location.hash.includes("type=recovery"));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadContext(); }, [session?.user?.id]);

  async function loadContext() {
    setError(""); setReady(false);
    try {
      const { data: prof } = await supabase.from("profiles")
        .select("display_name, is_admin").eq("id", session.user.id).maybeSingle();
      setProfile(prof);

      const { data: p, error: pe } = await supabase.from("pools")
        .select("*").eq("season", SEASON).maybeSingle();
      if (pe) throw pe;
      if (!p) { setError(`No ${SEASON} pool exists yet.`); return; }
      setPool(p);

      const { data: es, error: ee } = await supabase.from("entries")
        .select("*").eq("pool_id", p.id).eq("user_id", session.user.id)
        .eq("is_active", true).order("created_at");
      if (ee) throw ee;
      setEntries(es || []);
      setEntryId(id => (es || []).some(e => e.id === id) ? id : es?.[0]?.id ?? null);
    } catch (e) {
      setError("Could not load the pool. " + e.message);
    } finally { setReady(true); }
  }

  function onEntryCreated(row) {
    sessionStorage.removeItem("boxpool_invite");
    setEntries(list => [...list, row]);
    setEntryId(row.id);
    setAdding(false);
  }

  if (session === undefined) return <div className="empty">Loading...</div>;
  if (recovering && session) {
    return <ResetPassword onDone={() => { setRecovering(false); loadContext(); }} />;
  }
  if (!session) return <Auth />;

  const isAdmin = !!profile?.is_admin;
  const name = profile?.display_name || session.user.email;
  const entry = adding ? null : entries.find(e => e.id === entryId) || null;
  const swapsOn = !!pool?.swap_opens_week && entries.length > 0;

  const tabs = [
    ["picks", "My picks"],
    ...(swapsOn ? [["swaps", "Swaps"]] : []),
    ["board", "Standings"],
    ["rules", "Rules"],
    ...(isAdmin ? [["admin", "Admin"]] : []),
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand display">
            NFL Fantasy Box Pool <span className="season num">{SEASON}</span>
          </div>
          <div className="spacer" />
          <span className="who">{name}{isAdmin && <span className="admin-dot">admin</span>}</span>
          <button className="btn-sm btn-ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
        <div className="wrap">
          <nav className="tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} className="tab" role="tab" aria-selected={tab === id}
                onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <main className="wrap" style={{ padding: "20px 16px 60px" }}>
        {error && <div className="msg msg-err" role="alert">{error}</div>}
        {!ready && !error && <div className="empty">Loading...</div>}

        {ready && pool && entries.length > 0 && (tab === "picks" || tab === "swaps") && (
          <div className="entry-bar">
            <span className="eyebrow">Entry</span>
            {entries.map(e => (
              <button key={e.id} className="slot-chip"
                aria-current={!adding && e.id === entryId}
                onClick={() => { setEntryId(e.id); setAdding(false); }}>
                {e.entry_name}
              </button>
            ))}
            {tab === "picks" && (
              <button className="slot-chip" aria-current={adding}
                onClick={() => setAdding(true)}>+ Add entry</button>
            )}
          </div>
        )}

        {ready && pool && (
          <>
            {tab === "picks" && (
              <PickSheet pool={pool} entry={entry} onEntryCreated={onEntryCreated} />
            )}
            {tab === "swaps" && (
              <Swaps pool={pool} entry={entries.find(e => e.id === entryId) || null} />
            )}
            {tab === "board" && <Leaderboard pool={pool} isAdmin={isAdmin} />}
            {tab === "rules" && <Rules pool={pool} />}
            {tab === "admin" && isAdmin && <Admin pool={pool} onPoolChange={setPool} />}
          </>
        )}
      </main>
    </>
  );
}
