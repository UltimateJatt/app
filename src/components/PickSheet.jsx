import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";

export default function PickSheet({ pool, entry, onEntryCreated }) {
  const [slots, setSlots] = useState([]);
  const [board, setBoard] = useState([]);
  const [picks, setPicks] = useState({});      // slot_code -> player_id
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [entryName, setEntryName] = useState("");
  const [invite, setInvite] = useState(
    () => sessionStorage.getItem("boxpool_invite") || "");

  const locked = pool?.picks_lock_at && new Date(pool.picks_lock_at) < new Date();

  useEffect(() => { load(); }, [pool?.id, entry?.id]);

  async function load() {
    if (!pool) return;
    setLoading(true); setError("");
    try {
      const [s, b] = await Promise.all([
        supabase.from("roster_slots")
          .select("slot_code, position, tier, sort_order")
          .eq("pool_id", pool.id).order("sort_order"),
        supabase.from("v_tier_board")
          .select("slot_code, player_id, full_name, team, is_rookie, points_2025, ppg_2025, games_2025, data_quality")
          .eq("pool_id", pool.id),
      ]);
      if (s.error) throw s.error;
      if (b.error) throw b.error;

      setSlots(s.data);
      setBoard(b.data);
      setActive(a => a ?? s.data[0]?.slot_code ?? null);

      if (entry) {
        const { data, error } = await supabase.from("entry_picks")
          .select("slot_code, player_id").eq("entry_id", entry.id);
        if (error) throw error;
        setPicks(Object.fromEntries(data.map(p => [p.slot_code, p.player_id])));
      }
    } catch (e) {
      setError("Could not load the pick sheet. " + e.message);
    } finally {
      setLoading(false);
    }
  }

  const bySlot = useMemo(() => {
    const m = {};
    for (const p of board) (m[p.slot_code] ??= []).push(p);
    for (const k in m) m[k].sort((a, b) => (b.points_2025 ?? -1) - (a.points_2025 ?? -1));
    return m;
  }, [board]);

  const made = slots.filter(s => picks[s.slot_code]).length;
  const complete = made === slots.length && slots.length > 0;

  const options = useMemo(() => {
    const list = bySlot[active] || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(p =>
      p.full_name.toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q));
  }, [bySlot, active, search]);

  async function createEntry() {
    if (!entryName.trim()) return setError("Give your entry a name.");
    setSaving(true); setError("");
    try {
      const { data, error } = await supabase.rpc("create_entry", {
        p_pool_id: pool.id,
        p_entry_name: entryName.trim(),
        p_invite_code: invite.trim(),
      });
      if (error) throw error;
      onEntryCreated(data);
    } catch (e) {
      setError(e.message);
    } finally { setSaving(false); }
  }

  async function choose(slotCode, playerId) {
    if (locked) return;
    const previous = picks[slotCode];
    setPicks(p => ({ ...p, [slotCode]: playerId }));   // optimistic
    setError(""); setNotice("");

    try {
      const weeks = `[1,${pool.regular_season_weeks + 1})`;
      if (previous) {
        const { error } = await supabase.from("entry_picks")
          .update({ player_id: playerId })
          .eq("entry_id", entry.id).eq("slot_code", slotCode);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("entry_picks").insert({
          entry_id: entry.id, slot_code: slotCode,
          player_id: playerId, valid_weeks: weeks,
        });
        if (error) throw error;
      }
      // Move to the next unfilled slot so the sheet keeps flowing.
      const i = slots.findIndex(s => s.slot_code === slotCode);
      const next = slots.slice(i + 1).find(s => !picks[s.slot_code] && s.slot_code !== slotCode);
      if (next) { setActive(next.slot_code); setSearch(""); }
    } catch (e) {
      setPicks(p => ({ ...p, [slotCode]: previous }));   // roll back
      setError("That pick didn't save. " + e.message);
    }
  }

  if (!entry) {
    return (
      <div className="card" style={{ maxWidth: 440, margin: "40px auto" }}>
        <div className="card-head"><h2>Create your entry</h2></div>
        <div className="card-body">
          {error && <div className="msg msg-err" role="alert">{error}</div>}
          <p style={{ color: "var(--chalk-dim)", fontSize: 14, marginTop: 0 }}>
            Name your team. This is what shows on the leaderboard, and you can't change it
            once the season starts. You can add more entries later.
          </p>
          <div className="field">
            <label htmlFor="en">Entry name</label>
            <input id="en" value={entryName} maxLength={40}
              onChange={e => setEntryName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createEntry()} />
          </div>
          <div className="field">
            <label htmlFor="ic2">Invite code</label>
            <input id="ic2" value={invite} autoCapitalize="characters"
              onChange={e => setInvite(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createEntry()} />
          </div>
          <button className="btn-primary" onClick={createEntry} disabled={saving}
            style={{ width: "100%" }}>
            {saving ? "Creating..." : "Create entry"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <div className="empty">Loading the board...</div>;

  const activeSlot = slots.find(s => s.slot_code === active);

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="progress">
            <div>
              <div className="eyebrow">{entry.entry_name}</div>
              <strong className="num">{made} of {slots.length}</strong> picked
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(made / slots.length) * 100}%` }} />
            </div>
          </div>

          {complete && !locked && (
            <div className="msg msg-ok" style={{ marginTop: 14, marginBottom: 0 }}>
              Roster complete. You can keep changing picks until the deadline.
            </div>
          )}
          {locked && (
            <div className="msg msg-info" style={{ marginTop: 14, marginBottom: 0 }}>
              Picks are locked for the season.
            </div>
          )}
        </div>
      </div>

      {error && <div className="msg msg-err" role="alert">{error}</div>}
      {notice && <div className="msg msg-ok" role="status">{notice}</div>}

      <nav className="slot-nav" aria-label="Roster slots">
        {slots.map(s => (
          <button key={s.slot_code} className={`slot-chip${picks[s.slot_code] ? " done" : ""}`}
            aria-current={s.slot_code === active}
            onClick={() => { setActive(s.slot_code); setSearch(""); }}>
            {s.slot_code.replace("_T", " ")}
          </button>
        ))}
      </nav>

      <div className="card">
        <div className="card-head">
          <h2>{activeSlot?.position} Tier {activeSlot?.tier}</h2>
          <span className="eyebrow">{(bySlot[active] || []).length} eligible</span>
          <div className="spacer" style={{ flex: 1 }} />
          <input style={{ maxWidth: 220 }} value={search} placeholder="Search this tier"
            aria-label="Search players in this tier"
            onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="card-body">
          {options.length === 0 && (
            <div className="empty"><h3>No players match</h3><p>Clear the search to see the full tier.</p></div>
          )}
          {options.map(p => {
            const chosen = picks[active] === p.player_id;
            return (
              <button key={p.player_id} className="pick-row" aria-pressed={chosen}
                disabled={locked} onClick={() => choose(active, p.player_id)}>
                <span>
                  <span className="pick-name">{p.full_name}</span>
                  <span className="pick-meta">{p.team || "Free agent"}</span>
                </span>
                {p.data_quality === "ROOKIE" ? <span className="tag tag-rookie">Rookie</span>
                  : p.data_quality === "NO DATA" ? <span className="tag tag-nodata">No 2025 data</span>
                  : <span />}
                <span className="pick-pts">
                  {p.points_2025 != null ? (
                    <>
                      <span className="big num">{p.points_2025.toFixed(1)}</span>
                      <span className="sub num">{p.ppg_2025?.toFixed(1)}/g · {p.games_2025}g</span>
                    </>
                  ) : <span className="sub">2025 —</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
