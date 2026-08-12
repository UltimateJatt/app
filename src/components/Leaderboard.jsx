import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase.js";

export default function Leaderboard({ pool, isAdmin }) {
  const [rows, setRows] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [winners, setWinners] = useState([]);
  const [weekStatus, setWeekStatus] = useState([]);
  const [showWinners, setShowWinners] = useState(false);
  const [week, setWeek] = useState("total");
  const [search, setSearch] = useState("");
  const [openEntry, setOpenEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, [pool?.id]);

  async function load() {
    if (!pool) return;
    setLoading(true); setError("");
    try {
      const [l, w, win, st] = await Promise.all([
        supabase.from("v_standings")
          .select("entry_id, entry_name, owner_name, season_total, avg_week, best_week, overall_rank, weekly_wins, weekly_winnings")
          .eq("pool_id", pool.id).order("overall_rank"),
        supabase.from("v_entry_week_score")
          .select("entry_id, week, points, missing_players").eq("pool_id", pool.id),
        supabase.from("v_weekly_winners")
          .select("week, entry_id, entry_name, points, winner_count, payout")
          .eq("pool_id", pool.id).order("week"),
        supabase.from("v_week_status")
          .select("week, status, missing_players, top_score")
          .eq("pool_id", pool.id).order("week"),
      ]);
      if (l.error) throw l.error;
      if (w.error) throw w.error;
      if (win.error) throw win.error;
      if (st.error) throw st.error;
      setRows(l.data); setWeekly(w.data);
      setWinners(win.data); setWeekStatus(st.data);
    } catch (e) {
      setError("Could not load the leaderboard. " + e.message);
    } finally { setLoading(false); }
  }

  const playedWeeks = useMemo(() => {
    const s = new Set(weekly.filter(w => Number(w.points) > 0).map(w => w.week));
    return [...s].sort((a, b) => a - b);
  }, [weekly]);

  const weekMap = useMemo(() => {
    const m = {};
    for (const w of weekly) (m[w.entry_id] ??= {})[w.week] = w;
    return m;
  }, [weekly]);

  const display = useMemo(() => {
    let list = rows.map(r => ({
      ...r,
      week_points: week === "total" ? null : (weekMap[r.entry_id]?.[Number(week)]?.points ?? null),
      missing: week === "total" ? 0 : (weekMap[r.entry_id]?.[Number(week)]?.missing_players ?? 0),
    }));
    if (week !== "total") {
      list.sort((a, b) => (b.week_points ?? -1) - (a.week_points ?? -1));
      let last = null, rank = 0;
      list.forEach((r, i) => {
        if (r.week_points !== last) { rank = i + 1; last = r.week_points; }
        r.week_rank = rank;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.entry_name.toLowerCase().includes(q));
    }
    return list;
  }, [rows, weekMap, week, search]);

  if (loading) return <div className="empty">Loading standings...</div>;
  if (error) return <div className="msg msg-err" role="alert">{error}</div>;

  if (!rows.length) {
    return (
      <div className="empty">
        <h3>No entries yet</h3>
        <p>Standings appear once entries are created and the first week is scored.</p>
      </div>
    );
  }

  const noneScored = playedWeeks.length === 0;
  const rostersOpen = isAdmin ||
    (!!pool.picks_lock_at && new Date(pool.picks_lock_at) <= new Date());

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Standings</h2>
          {isAdmin && !(!!pool.picks_lock_at && new Date(pool.picks_lock_at) <= new Date()) && (
            <span className="tag tag-rookie">Admin view: rosters visible</span>
          )}
          <button className="btn-sm" onClick={() => setShowWinners(true)}>Weekly winners</button>
          <div style={{ flex: 1 }} />
          <select style={{ maxWidth: 170 }} value={week} aria-label="Week"
            onChange={e => setWeek(e.target.value)}>
            <option value="total">Season total</option>
            {Array.from({ length: pool.regular_season_weeks }, (_, i) => i + 1).map(w => (
              <option key={w} value={w} disabled={!playedWeeks.includes(w)}>
                Week {w}{playedWeeks.includes(w) ? "" : " (not played)"}
              </option>
            ))}
          </select>
          <input style={{ maxWidth: 190 }} value={search} placeholder="Find an entry"
            aria-label="Find an entry" onChange={e => setSearch(e.target.value)} />
        </div>

        {(!rostersOpen || noneScored) && (
          <div className="card-body" style={{ paddingBottom: 0 }}>
            {!rostersOpen && (
              <div className="msg msg-info" style={{ marginBottom: noneScored ? 10 : 0 }}>
                Rosters stay hidden until picks lock, so nobody can draft off
                what everyone else took. Yours is on the My picks tab.
              </div>
            )}
            {noneScored && (
              <div className="msg msg-info" style={{ marginBottom: 0 }}>
                No weeks have been scored yet. Totals fill in after the first games.
              </div>
            )}
          </div>
        )}

        <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 46 }}>{week === "total" ? "Rk" : "Wk"}</th>
                <th>Entry</th>
                {week !== "total" && <th className="r">Week</th>}
                <th className="r">Season</th>
                <th className="r">Avg</th>
                <th className="r">Wins</th>
                <th className="r">Won</th>
              </tr>
            </thead>
            <tbody>
              {display.map(r => (
                <tr key={r.entry_id}
                  style={{ cursor: rostersOpen ? "pointer" : "default" }}
                  onClick={() => rostersOpen && setOpenEntry(r)}
                  tabIndex={rostersOpen ? 0 : -1}
                  role={rostersOpen ? "button" : undefined}
                  onKeyDown={e => rostersOpen && (e.key === "Enter" || e.key === " ")
                    && (e.preventDefault(), setOpenEntry(r))}>
                  <td className="num rank">{week === "total" ? r.overall_rank : r.week_rank}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.entry_name}</div>
                    <div style={{ fontSize: 12, color: "var(--slate)" }}>{r.owner_name}</div>
                  </td>
                  {week !== "total" && (
                    <td className="r num" style={{ color: "var(--amber)", fontSize: 16 }}>
                      {r.week_points != null ? Number(r.week_points).toFixed(2) : "—"}
                      {r.missing > 0 && (
                        <div style={{ fontSize: 11, color: "var(--rust)" }}>
                          {r.missing} missing
                        </div>
                      )}
                    </td>
                  )}
                  <td className="r num">{r.season_total != null ? Number(r.season_total).toFixed(2) : "—"}</td>
                  <td className="r num" style={{ color: "var(--chalk-dim)" }}>
                    {r.avg_week != null ? Number(r.avg_week).toFixed(1) : "—"}</td>
                  <td className="r num" style={{ color: "var(--chalk-dim)" }}>
                    {r.weekly_wins || "—"}</td>
                  <td className="r num" style={{ color: Number(r.weekly_winnings) > 0 ? "var(--mint)" : "var(--slate)" }}>
                    {Number(r.weekly_winnings) > 0 ? "$" + Number(r.weekly_winnings).toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showWinners && (
        <WinnersDialog winners={winners} status={weekStatus}
          weeks={pool.regular_season_weeks} onClose={() => setShowWinners(false)} />
      )}

      {openEntry && (
        <RosterModal entry={openEntry} pool={pool}
          week={week === "total" ? null : Number(week)}
          onClose={() => setOpenEntry(null)} />
      )}
    </>
  );
}

function RosterModal({ entry, pool, week, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => { load(); }, [entry.entry_id, week]);

  async function load() {
    setLoading(true); setError("");
    try {
      const { data, error } = await supabase.rpc("entry_roster_detail", {
        p_entry_id: entry.entry_id, p_week: week,
      });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setError("Could not load this roster. " + e.message);
    } finally { setLoading(false); }
  }

  const total = rows.reduce((a, r) => a + Number(r.points || 0), 0);

  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`${entry.entry_name} roster`}
        ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <div>
            <h2>{entry.entry_name}</h2>
            <div className="eyebrow">{week ? `Week ${week}` : "Season total"}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">
          {loading && <div className="empty">Loading roster...</div>}
          {error && <div style={{ padding: 16 }}><div className="msg msg-err">{error}</div></div>}
          {!loading && !error && (
            <table className="tbl">
              <thead>
                <tr><th>Slot</th><th>Player</th><th className="r">Points</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.slot_code}>
                    <td className="eyebrow">{r.slot_code.replace("_T", " ")}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                      <div style={{ fontSize: 12, color: "var(--slate)" }}>{r.team}</div>
                    </td>
                    <td className="r num" style={{ color: r.points == null ? "var(--rust)" : "var(--amber)" }}>
                      {r.points != null ? Number(r.points).toFixed(2) : "no data"}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ fontWeight: 700 }}>Total</td>
                  <td className="r num" style={{ fontWeight: 700, fontSize: 17, color: "var(--amber)" }}>
                    {total.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function WinnersDialog({ winners, status, weeks, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const byWeek = {};
  for (const w of winners) (byWeek[w.week] ??= []).push(w);
  const statusOf = {};
  for (const s of status) statusOf[s.week] = s;

  const running = winners.reduce((a, w) => {
    a[w.entry_name] = (a[w.entry_name] || 0) + Number(w.payout); return a;
  }, {});
  const banked = Object.entries(running).sort((a, b) => b[1] - a[1]);
  const total = winners.reduce((a, w) => a + Number(w.payout), 0);

  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Weekly winners"
        ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <div>
            <h2>Weekly winners</h2>
            <div className="eyebrow">${total.toFixed(2)} paid out so far</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">
          <table className="tbl">
            <thead>
              <tr><th style={{ width: 52 }}>Wk</th><th>Winner</th>
                  <th className="r">Score</th><th className="r">Payout</th></tr>
            </thead>
            <tbody>
              {Array.from({ length: weeks }, (_, i) => i + 1).map(wk => {
                const ws = byWeek[wk];
                const st = statusOf[wk];
                if (!ws) {
                  const label = !st ? "Not played"
                    : st.status === "PARTIAL" ? `Waiting on data (${st.missing_players} players)`
                    : st.status === "NOT PLAYED" ? "Not played" : "Pending";
                  return (
                    <tr key={wk}>
                      <td className="num" style={{ color: "var(--slate)" }}>{wk}</td>
                      <td colSpan={3} style={{
                        color: st?.status === "PARTIAL" ? "var(--rust)" : "var(--slate)",
                        fontSize: 14 }}>{label}</td>
                    </tr>
                  );
                }
                return ws.map((w, i) => (
                  <tr key={`${wk}-${w.entry_id}`}>
                    <td className="num rank">{i === 0 ? wk : ""}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{w.entry_name}</span>
                      {w.winner_count > 1 && (
                        <span className="tag tag-nodata" style={{ marginLeft: 8 }}>
                          {w.winner_count}-way tie
                        </span>
                      )}
                    </td>
                    <td className="r num">{Number(w.points).toFixed(2)}</td>
                    <td className="r num" style={{ color: "var(--mint)" }}>
                      ${Number(w.payout).toFixed(2)}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>

          {banked.length > 0 && (
            <>
              <div className="card-head" style={{ borderTop: "1px solid var(--line)" }}>
                <h2>Banked so far</h2>
              </div>
              <table className="tbl">
                <tbody>
                  {banked.map(([name, amt]) => (
                    <tr key={name}>
                      <td style={{ fontWeight: 600 }}>{name}</td>
                      <td className="r num" style={{ color: "var(--mint)" }}>${amt.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
