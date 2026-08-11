import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { buildPlan, suggestPlaceCount, suggestWeeklyPrize } from "../prizePlan.js";

const money = n => (n == null ? "—" : "$" + Number(n).toFixed(2));

export default function Admin({ pool, onPoolChange }) {
  const [entries, setEntries] = useState([]);
  const [pot, setPot] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [weeklyPrize, setWeeklyPrize] = useState(null);
  const [placeCount, setPlaceCount] = useState(null);
  const [refundLast, setRefundLast] = useState(true);
  const [overrides, setOverrides] = useState({});
  const [modelEntries, setModelEntries] = useState(null);
  const [codes, setCodes] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [newMax, setNewMax] = useState("");

  useEffect(() => { load(); }, [pool?.id]);

  async function load() {
    setLoading(true); setError("");
    try {
      const [e, m, p, c] = await Promise.all([
        supabase.rpc("admin_entries", { p_pool_id: pool.id }),
        supabase.from("v_pool_money").select("*").eq("pool_id", pool.id).maybeSingle(),
        supabase.from("prize_allocations").select("*").eq("pool_id", pool.id).order("sort_order"),
        supabase.from("invite_codes").select("*").eq("pool_id", pool.id).order("created_at"),
      ]);
      if (e.error) throw e.error;
      if (m.error) throw m.error;
      if (p.error) throw p.error;
      setEntries(e.data || []); setPot(m.data); setPrizes(p.data);
      setCodes(c.error ? [] : (c.data || []));
    } catch (err) {
      setError("Could not load admin data. " + err.message);
    } finally { setLoading(false); }
  }

  async function togglePaid(entry) {
    setError(""); setNotice("");
    const next = !entry.has_paid;
    setEntries(list => list.map(x =>
      x.entry_id === entry.entry_id ? { ...x, has_paid: next } : x));
    const { error } = await supabase.rpc("set_entry_paid", {
      p_entry_id: entry.entry_id, p_paid: next,
    });
    if (error) {
      setEntries(list => list.map(x =>
        x.entry_id === entry.entry_id ? { ...x, has_paid: !next } : x));
      setError("Could not record that. " + error.message);
    } else {
      load();   // pot changes when someone pays
    }
  }

  async function addCode() {
    const code = newCode.trim();
    if (code.length < 4) return setError("Invite codes should be at least 4 characters.");
    setError(""); setNotice("");
    const { error } = await supabase.from("invite_codes").insert({
      pool_id: pool.id, code,
      max_uses: newMax === "" ? null : Number(newMax),
    });
    if (error) setError(/duplicate|unique/i.test(error.message)
      ? "That code already exists." : error.message);
    else { setNewCode(""); setNewMax(""); setNotice("Invite code created."); load(); }
  }

  async function toggleCode(c) {
    const { error } = await supabase.from("invite_codes")
      .update({ is_active: !c.is_active }).eq("code", c.code);
    if (error) setError(error.message); else load();
  }

  async function removeEntry(e) {
    if (!confirm(`Remove "${e.entry_name}"?\n\nBefore any week is scored this deletes the entry outright. Once scoring has started it is only deactivated, so past weekly winners are not rewritten.`)) return;
    setBusy(true); setError(""); setNotice("");
    const { data, error } = await supabase.rpc("remove_entry", { p_entry_id: e.entry_id });
    if (error) setError(error.message); else { setNotice(data); await load(); }
    setBusy(false);
  }

  async function restoreEntry(e) {
    const { error } = await supabase.rpc("restore_entry", { p_entry_id: e.entry_id });
    if (error) setError(error.message);
    else { setNotice(`${e.entry_name} restored.`); load(); }
  }

  async function applyPlan() {
    if (!plan.valid) return setError(plan.problem);
    if (!confirm("This replaces the whole payout table. Continue?")) return;
    setBusy(true); setError(""); setNotice("");
    const { error } = await supabase.rpc("apply_prize_plan", {
      p_pool_id: pool.id, p_rows: plan.rows,
    });
    if (error) setError(error.message);
    else { setNotice("Payout table saved."); setOverrides({}); await load(); }
    setBusy(false);
  }

  async function savePool(patch) {
    setBusy(true); setError(""); setNotice("");
    const { data, error } = await supabase.from("pools")
      .update(patch).eq("id", pool.id).select().single();
    if (error) setError("Could not save. " + error.message);
    else { onPoolChange(data); setNotice("Saved."); await load(); }
    setBusy(false);
  }

  const entriesCount = entries.filter(e => e.is_active).length;
  const paidCount = Number(pot?.paid_entries || 0);
  const realPot = Number(pot?.total_pot || 0);

  // You can model any entry count to see what the payouts would look
  // like. Saving is only allowed when the model matches the real pot,
  // because the database will not store a plan that does not balance.
  const modelled = modelEntries == null ? paidCount : Number(modelEntries);
  const isModel = modelled !== paidCount;
  const potTotal = isModel
    ? modelled * Number(pool.entry_fee || 0) + Number(pot?.swap_revenue || 0)
    : realPot;

  const pc = placeCount ?? suggestPlaceCount(modelled);
  const wp = weeklyPrize ?? suggestWeeklyPrize(potTotal, pool.regular_season_weeks, {
    refund: Number(pool.entry_fee || 0),
    placeCount: Number(pc) || 3,
  });

  const plan = useMemo(() => buildPlan({
    pot: potTotal,
    weeks: pool.regular_season_weeks,
    weeklyPrize: Number(wp) || 0,
    placeCount: Number(pc) || 3,
    refundLastPlace: refundLast,
    entryFee: pool.entry_fee,
    overrides,
  }), [potTotal, pool.regular_season_weeks, wp, pc, refundLast, pool.entry_fee, overrides]);

  if (loading) return <div className="empty">Loading admin...</div>;

  const active = entries.filter(e => e.is_active);
  const unpaid = active.filter(e => !e.has_paid);
  const incomplete = active.filter(e => e.slots_filled < e.slots_required);

  return (
    <>
      {error && <div className="msg msg-err" role="alert">{error}</div>}
      {notice && <div className="msg msg-ok" role="status">{notice}</div>}

      {/* ---- money ---- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Prize pool</h2>
          <div style={{ flex: 1 }} />
          <span className={"tag " + (pot?.prize_status === "BALANCED" ? "tag-rookie" : "tag-nodata")}>
            {pot?.prize_status}
          </span>
        </div>
        <div className="card-body">
          <div className="stat-grid">
            <Stat label="Entries paid" value={`${pot?.paid_entries ?? 0} of ${entries.filter(e => e.is_active).length}`} />
            <Stat label="Entry money" value={money(pot?.entry_revenue)} />
            <Stat label="Swap fees" value={money(pot?.swap_revenue)} />
            <Stat label="Total pot" value={money(pot?.total_pot)} accent />
          </div>

          {unpaid.length > 0 && (
            <div className="msg msg-info" style={{ marginTop: 14 }}>
              {unpaid.length} {unpaid.length === 1 ? "entry has" : "entries have"} not paid.
              The pot only counts paid entries, so it will grow as you mark them off.
            </div>
          )}
          {Number(pot?.unallocated) !== 0 && Number(pot?.allocated) > 0 && (
            <div className="msg msg-err" style={{ marginTop: 14 }}>
              {money(Math.abs(pot.unallocated))} {pot.unallocated > 0 ? "is unallocated" : "is over-allocated"}.
              Rebuild the payout table or adjust the amounts below.
            </div>
          )}
        </div>
      </div>

      {/* ---- entries ---- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Entries</h2>
          <span className="eyebrow">{entries.filter(e => e.is_active).length} active</span>
        </div>
        {incomplete.length > 0 && (
          <div className="card-body" style={{ paddingBottom: 0 }}>
            <div className="msg msg-info" style={{ marginBottom: 0 }}>
              {incomplete.length} {incomplete.length === 1 ? "roster is" : "rosters are"} unfinished.
            </div>
          </div>
        )}
        <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
          {entries.length === 0 ? (
            <div className="empty"><h3>No entries yet</h3><p>They appear here as people register.</p></div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Entry</th><th>Owner</th>
                  <th className="r">Roster</th><th className="r">Swaps</th>
                  <th className="r">Paid</th><th className="r"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.entry_id} style={{ opacity: e.is_active ? 1 : .5 }}>
                    <td style={{ fontWeight: 600 }}>
                      {e.entry_name}
                      {!e.is_active && <span className="tag tag-nodata" style={{ marginLeft: 8 }}>Removed</span>}
                    </td>
                    <td>
                      <div>{e.owner_name}</div>
                      <div style={{ fontSize: 12, color: "var(--slate)" }}>{e.owner_email}</div>
                    </td>
                    <td className="r num" style={{
                      color: e.slots_filled === e.slots_required ? "var(--mint)" : "var(--rust)" }}>
                      {e.slots_filled}/{e.slots_required}
                    </td>
                    <td className="r num" style={{ color: "var(--slate)" }}>{e.swaps_used}</td>
                    <td className="r">
                      <button className="btn-sm" onClick={() => togglePaid(e)}
                        disabled={!e.is_active}
                        style={e.has_paid
                          ? { background: "rgba(78,201,138,.15)", borderColor: "var(--mint)", color: "var(--mint)" }
                          : {}}>
                        {e.has_paid ? "Paid" : "Mark paid"}
                      </button>
                    </td>
                    <td className="r">
                      {e.is_active ? (
                        <button className="btn-sm btn-ghost" disabled={busy}
                          onClick={() => removeEntry(e)}
                          style={{ color: "var(--rust)" }}>Remove</button>
                      ) : (
                        <button className="btn-sm btn-ghost"
                          onClick={() => restoreEntry(e)}>Restore</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- payouts ---- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Payouts</h2>
          <div style={{ flex: 1 }} />
          {pool.prizes_finalized && <span className="tag tag-nodata">Locked</span>}
        </div>
        <div className="card-body">
          <p style={{ color: "var(--chalk-dim)", fontSize: 14, marginTop: 0 }}>
            Money comes off the pot in this order: last place refund, then weekly prizes,
            then everything left is split across the paid places. Every amount is a whole
            dollar, and first place takes the remainder so nothing is stranded.
          </p>

          <div className="plan-controls">
            <div>
              <label htmlFor="wkp">Weekly prize</label>
              <input id="wkp" type="number" step="1" min="0" value={wp}
                disabled={pool.prizes_finalized}
                onChange={e => { setWeeklyPrize(e.target.value); setOverrides({}); }} />
              <span className="hint">x {pool.regular_season_weeks} weeks</span>
            </div>
            <div>
              <label htmlFor="pcn">Places paid</label>
              <input id="pcn" type="number" step="1" min="1" max="12" value={pc}
                disabled={pool.prizes_finalized}
                onChange={e => { setPlaceCount(e.target.value); setOverrides({}); }} />
              <span className="hint">{modelled} entries suggests {suggestPlaceCount(modelled)}</span>
            </div>
            <div>
              <label htmlFor="mdl">Plan for</label>
              <input id="mdl" type="number" step="1" min="1" value={modelled}
                onChange={e => {
                  setModelEntries(e.target.value);
                  setWeeklyPrize(null); setPlaceCount(null); setOverrides({});
                }} />
              <span className="hint">
                {isModel ? `${paidCount} actually paid` : "entries paid"}
              </span>
            </div>
            <div>
              <label htmlFor="rfl">Last place</label>
              <label className="check">
                <input id="rfl" type="checkbox" checked={refundLast}
                  disabled={pool.prizes_finalized}
                  onChange={e => { setRefundLast(e.target.checked); setOverrides({}); }} />
                <span>Entry fee back ({money(pool.entry_fee)})</span>
              </label>
            </div>
          </div>

          {isModel && (
            <div className="msg msg-info">
              Modelling {modelled} entries, a {money(potTotal)} pot. {paidCount} {paidCount === 1 ? "entry is" : "entries are"} actually
              paid so far, so this is a preview and cannot be saved yet.
              {" "}
              <button className="btn-sm btn-ghost" style={{ marginLeft: 4 }}
                onClick={() => { setModelEntries(null); setWeeklyPrize(null); setPlaceCount(null); setOverrides({}); }}>
                Back to actual
              </button>
            </div>
          )}

          {plan.problem && !isModel && paidCount < 3 ? (
            <div className="msg msg-info">
              Too early to set payouts with {paidCount} paid {paidCount === 1 ? "entry" : "entries"}.
              Use <strong>Plan for</strong> above to see how the money would split at a
              realistic entry count, then come back and save once people have paid.
            </div>
          ) : plan.problem ? (
            <div className="msg msg-err">{plan.problem}</div>
          ) : null}

          {plan.valid && (
            <>
              <table className="tbl" style={{ marginTop: 6 }}>
                <thead>
                  <tr><th>Prize</th><th className="r" style={{ width: 130 }}>Amount</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Weekly high score, {pool.regular_season_weeks} weeks</td>
                    <td className="r num">{money(wp)} each</td>
                  </tr>
                  {plan.rows.filter(r => r.kind === "PLACE")
                    .sort((a, b) => a.place - b.place).map(r => (
                    <tr key={r.place}>
                      <td style={{ fontWeight: r.place === 1 ? 700 : 400 }}>{r.label}</td>
                      <td className="r">
                        <input className="num" type="number" step="1"
                          value={overrides[`PLACE:${r.place}`] ?? r.amount}
                          disabled={pool.prizes_finalized || r.place === 1}
                          title={r.place === 1 ? "First place takes whatever is left" : ""}
                          style={{ width: 110, textAlign: "right" }}
                          onChange={e => setOverrides(o => ({
                            ...o, [`PLACE:${r.place}`]: Number(e.target.value) }))} />
                      </td>
                    </tr>
                  ))}
                  {plan.refund > 0 && (
                    <tr>
                      <td>Last place, entry fee back</td>
                      <td className="r num">{money(plan.refund)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ fontWeight: 700 }}>
                      Total {Object.keys(overrides).length > 0 && (
                        <button className="btn-sm btn-ghost" style={{ marginLeft: 8 }}
                          onClick={() => setOverrides({})}>Reset edits</button>
                      )}
                    </td>
                    <td className="r num" style={{ fontWeight: 700, fontSize: 17, color: "var(--amber)" }}>
                      {money(plan.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn-primary" onClick={applyPlan}
                  disabled={busy || pool.prizes_finalized || isModel}
                  title={isModel ? "Switch back to the actual entry count to save" : ""}>
                  Save this payout table
                </button>
                <button onClick={() => savePool({
                    prizes_finalized: !pool.prizes_finalized,
                    prizes_finalized_at: pool.prizes_finalized ? null : new Date().toISOString(),
                  })} disabled={busy || (!prizes.length && !pool.prizes_finalized)}>
                  {pool.prizes_finalized ? "Unlock payouts" : "Finalise payouts"}
                </button>
              </div>
            </>
          )}

          {prizes.length > 0 && (
            <p style={{ fontSize: 13, color: "var(--slate)", marginTop: 14, marginBottom: 0 }}>
              Saved table currently holds {prizes.length} rows totalling {money(pot?.allocated)}.
              {Number(pot?.unallocated) !== 0 &&
                ` It no longer matches the pot, so save again after marking payments.`}
            </p>
          )}
        </div>
      </div>

      {/* ---- invites ---- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Invite codes</h2>
          <div style={{ flex: 1 }} />
          <span className="eyebrow">{codes.filter(c => c.is_active).length} active</span>
        </div>
        <div className="card-body">
          <p style={{ color: "var(--chalk-dim)", fontSize: 14, marginTop: 0 }}>
            Nobody can create an entry without one of these. Share a single code with
            everyone, or make one per person so you can see who used what. Leave uses
            blank for unlimited.
          </p>
          <div className="plan-controls">
            <div>
              <label htmlFor="nc">New code</label>
              <input id="nc" value={newCode} placeholder="BOXPOOL26"
                onChange={ev => setNewCode(ev.target.value)}
                onKeyDown={ev => ev.key === "Enter" && addCode()} />
            </div>
            <div>
              <label htmlFor="nm">Max uses</label>
              <input id="nm" type="number" min="1" value={newMax} placeholder="unlimited"
                onChange={ev => setNewMax(ev.target.value)} />
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <button onClick={addCode}>Create</button>
            </div>
          </div>

          {codes.length > 0 && (
            <table className="tbl">
              <thead>
                <tr><th>Code</th><th className="r">Used</th><th className="r"></th></tr>
              </thead>
              <tbody>
                {codes.map(c => (
                  <tr key={c.code} style={{ opacity: c.is_active ? 1 : .5 }}>
                    <td className="num" style={{ fontWeight: 600 }}>{c.code}</td>
                    <td className="r num">
                      {c.uses}{c.max_uses ? ` / ${c.max_uses}` : ""}
                    </td>
                    <td className="r">
                      <button className="btn-sm btn-ghost" onClick={() => toggleCode(c)}>
                        {c.is_active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- settings ---- */}
      <div className="card">
        <div className="card-head"><h2>Pool settings</h2></div>
        <div className="card-body">
          <div className="field">
            <label htmlFor="lock">Pick deadline</label>
            <input id="lock" type="datetime-local" style={{ maxWidth: 260 }}
              defaultValue={pool.picks_lock_at ? pool.picks_lock_at.slice(0, 16) : ""}
              onBlur={ev => savePool({
                picks_lock_at: ev.target.value ? new Date(ev.target.value).toISOString() : null })} />
            <p style={{ fontSize: 13, color: "var(--slate)", margin: "6px 0 0" }}>
              After this moment nobody can change a pick. Leave blank to keep picking open.
            </p>
          </div>
          <div className="field">
            <label htmlFor="entryfee">Entry fee</label>
            <input id="entryfee" type="number" step="0.01" style={{ maxWidth: 160 }}
              defaultValue={pool.entry_fee}
              onBlur={ev => {
                const v = Number(ev.target.value);
                if (v !== Number(pool.entry_fee)) savePool({ entry_fee: v });
              }} />
          </div>
          <div className="field">
            <label htmlFor="swapweek">Swaps open in week</label>
            <input id="swapweek" type="number" min="1" max="18" style={{ maxWidth: 160 }}
              defaultValue={pool.swap_opens_week ?? ""}
              onBlur={ev => savePool({
                swap_opens_week: ev.target.value ? Number(ev.target.value) : null })} />
          </div>
          <div className="field">
            <label htmlFor="swapfee">Swap fee</label>
            <input id="swapfee" type="number" step="0.01" style={{ maxWidth: 160 }}
              defaultValue={pool.swap_fee ?? 0}
              onBlur={ev => savePool({ swap_fee: Number(ev.target.value) })} />
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <div className="eyebrow">{label}</div>
      <div className={"stat-val num" + (accent ? " accent" : "")}>{value}</div>
    </div>
  );
}
