import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";

const money = n => "$" + Number(n || 0).toFixed(2);

export default function Swaps({ pool, entry }) {
  const [roster, setRoster] = useState([]);
  const [board, setBoard] = useState([]);
  const [history, setHistory] = useState([]);
  const [win, setWin] = useState(null);
  const [openSlot, setOpenSlot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { load(); }, [entry?.id]);

  async function load() {
    if (!entry) return;
    setLoading(true); setError("");
    try {
      const [r, b, h, w] = await Promise.all([
        supabase.rpc("entry_roster_for_swaps", { p_entry_id: entry.id }),
        supabase.from("v_tier_board")
          .select("slot_code, player_id, full_name, team, is_rookie, points_2025, ppg_2025, data_quality")
          .eq("pool_id", pool.id),
        supabase.from("swaps")
          .select("slot_code, out_player_id, in_player_id, effective_week, fee, created_at")
          .eq("entry_id", entry.id).order("created_at", { ascending: false }),
        supabase.rpc("swap_window", { p_pool_id: pool.id }),
      ]);
      if (r.error) throw r.error;
      if (b.error) throw b.error;
      if (h.error) throw h.error;
      if (w.error) throw w.error;
      setRoster(r.data || []); setBoard(b.data || []);
      setHistory(h.data || []);
      setWin(Array.isArray(w.data) ? w.data[0] : w.data);
    } catch (e) {
      setError("Could not load your roster. " + e.message);
    } finally { setLoading(false); }
  }

  const bySlot = useMemo(() => {
    const m = {};
    for (const p of board) (m[p.slot_code] ??= []).push(p);
    for (const k in m) m[k].sort((a, b) => (b.points_2025 ?? -1) - (a.points_2025 ?? -1));
    return m;
  }, [board]);

  const nameOf = useMemo(
    () => Object.fromEntries(board.map(p => [p.player_id, p.full_name])), [board]);

  async function doSwap(slotCode, inPlayerId, outName, inName) {
    const week = win?.effective_week ?? pool.swap_opens_week;
    const fee = Number(pool.swap_fee || 0);
    const msg = `Swap ${outName} for ${inName} starting week ${week}?` +
      (fee > 0 ? `\n\nThis costs ${money(fee)} and goes into the prize pool.` : "") +
      `\n\nThis slot cannot be swapped again this season.`;
    if (!confirm(msg)) return;

    setBusy(true); setError(""); setNotice("");
    const { error } = await supabase.rpc("apply_swap", {
      p_entry_id: entry.id,
      p_slot_code: slotCode,
      p_in_player_id: inPlayerId,
      p_effective_week: week,
    });
    if (error) setError(error.message);
    else {
      setNotice(`${inName} is in from week ${week}. ${outName} keeps the points already earned.`);
      setOpenSlot(null);
      await load();
    }
    setBusy(false);
  }

  if (!entry) {
    return <div className="empty"><h3>No entry selected</h3>
      <p>Create an entry before making swaps.</p></div>;
  }

  const opensWeek = pool.swap_opens_week;
  if (!opensWeek) {
    return <div className="empty"><h3>Swaps are off</h3>
      <p>This pool does not allow mid-season swaps.</p></div>;
  }

  if (loading) return <div className="empty">Loading your roster...</div>;

  const status = win?.status || "NOT_YET";
  const week = win?.effective_week ?? opensWeek;
  const isOpen = !!win?.is_open;
  const used = roster.filter(r => r.swap_used).length;

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Swaps</h2>
          <div style={{ flex: 1 }} />
          <span className="eyebrow">{used} of {roster.length} slots used</span>
        </div>
        <div className="card-body">
          <p style={{ color: "var(--chalk-dim)", fontSize: 14, marginTop: 0 }}>
            There is one swap window all season, between the end of week {opensWeek - 1} and
            kickoff of week {opensWeek}. In it you can replace any player with someone from
            the same tier{Number(pool.swap_fee) > 0 ? ` for ${money(pool.swap_fee)} each` : ""}.
            Each slot can be changed once, so up to {roster.length} swaps, and you are not
            obliged to make any. Points already earned stay on your total; the new player
            scores for you from week {opensWeek} onward.
          </p>

          <div className={"msg " + (isOpen ? "msg-ok" : status === "CLOSED" ? "msg-err" : "msg-info")}
            style={{ marginBottom: 0 }}>
            {win?.detail}
          </div>
        </div>
      </div>

      {error && <div className="msg msg-err" role="alert">{error}</div>}
      {notice && <div className="msg msg-ok" role="status">{notice}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>Your roster</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Slot</th><th>Player</th>
                <th className="r">Points</th><th className="r">Swap</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(r => (
                <tr key={r.slot_code}>
                  <td className="eyebrow">{r.slot_code.replace("_T", " ")}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                    <div style={{ fontSize: 12, color: "var(--slate)" }}>{r.team}</div>
                  </td>
                  <td className="r num">{Number(r.season_pts).toFixed(2)}</td>
                  <td className="r">
                    {r.swap_used ? (
                      <span className="tag tag-nodata">Used</span>
                    ) : (
                      <button className="btn-sm"
                        disabled={!isOpen || busy}
                        onClick={() => setOpenSlot(r)}>
                        Swap
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {history.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Swap history</h2></div>
          <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr><th>Slot</th><th>Out</th><th>In</th>
                    <th className="r">From</th><th className="r">Fee</th></tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.slot_code + h.created_at}>
                    <td className="eyebrow">{h.slot_code.replace("_T", " ")}</td>
                    <td style={{ color: "var(--slate)" }}>
                      {nameOf[h.out_player_id] || h.out_player_id}</td>
                    <td style={{ fontWeight: 600 }}>
                      {nameOf[h.in_player_id] || h.in_player_id}</td>
                    <td className="r num">wk {h.effective_week}</td>
                    <td className="r num">{money(h.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openSlot && (
        <SwapPicker slot={openSlot} week={week} fee={pool.swap_fee}
          options={(bySlot[openSlot.slot_code] || []).filter(p => p.player_id !== openSlot.player_id)}
          busy={busy}
          onPick={p => doSwap(openSlot.slot_code, p.player_id, openSlot.full_name, p.full_name)}
          onClose={() => setOpenSlot(null)} />
      )}
    </>
  );
}

function SwapPicker({ slot, week, fee, options, busy, onPick, onClose }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = q.trim()
    ? options.filter(p => p.full_name.toLowerCase().includes(q.toLowerCase()))
    : options;

  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true"
        aria-label={`Replace ${slot.full_name}`}>
        <div className="modal-head">
          <div>
            <h2>Replace {slot.full_name}</h2>
            <div className="eyebrow">
              {slot.slot_code.replace("_T", " ")} · from week {week}
              {Number(fee) > 0 ? ` · ${money(fee)}` : ""}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn-sm" onClick={onClose}>Cancel</button>
        </div>
        <div className="card-head">
          <input value={q} placeholder="Search this tier" aria-label="Search"
            onChange={e => setQ(e.target.value)} />
        </div>
        <div className="modal-body" style={{ padding: 12 }}>
          {list.length === 0 && <div className="empty"><p>No players match.</p></div>}
          {list.map(p => (
            <button key={p.player_id} className="pick-row" disabled={busy}
              onClick={() => onPick(p)}>
              <span>
                <span className="pick-name">{p.full_name}</span>
                <span className="pick-meta">{p.team || "Free agent"}</span>
              </span>
              {p.data_quality === "ROOKIE"
                ? <span className="tag tag-rookie">Rookie</span> : <span />}
              <span className="pick-pts">
                {p.points_2025 != null
                  ? <span className="big num">{p.points_2025.toFixed(1)}</span>
                  : <span className="sub">—</span>}
                <span className="sub">2025</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
