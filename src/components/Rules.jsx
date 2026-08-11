import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";

const money = n => (n == null ? "—" : "$" + Number(n).toFixed(2));

export default function Rules({ pool }) {
  const [slots, setSlots] = useState([]);
  const [pot, setPot] = useState(null);
  const [prizes, setPrizes] = useState([]);

  useEffect(() => { load(); }, [pool?.id]);

  async function load() {
    const [s, m, p] = await Promise.all([
      supabase.from("roster_slots").select("*").eq("pool_id", pool.id).order("sort_order"),
      supabase.from("v_pool_money").select("*").eq("pool_id", pool.id).maybeSingle(),
      supabase.from("prize_allocations").select("*").eq("pool_id", pool.id).order("sort_order"),
    ]);
    setSlots(s.data || []);
    setPot(m.data || null);
    setPrizes(p.data || []);
  }

  // Group slots into "QB x4" style counts, read from the database
  // rather than written down, so this page cannot drift from reality.
  const byPos = slots.reduce((a, s) => {
    (a[s.position] ??= []).push(s.tier); return a;
  }, {});
  const order = ["QB", "RB", "WR", "TE", "K", "DL"];
  const positions = order.filter(p => byPos[p]);

  const weekly = prizes.filter(p => p.kind === "WEEKLY");
  const places = prizes.filter(p => p.kind !== "WEEKLY");
  const deadline = pool.picks_lock_at ? new Date(pool.picks_lock_at) : null;

  return (
    <div className="prose">
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>How it works</h2></div>
        <div className="card-body">
          <p>
            You pick one player from every tier before the season starts, and those players
            are your team for all {pool.regular_season_weeks} weeks. Every point they score counts.
          </p>
          <p style={{ marginBottom: 0 }}>
            There are no lineups to set, no trades, no waivers, and nobody gets eliminated.
            A player on a bye simply scores nothing that week, same as everyone else who took him.
          </p>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Your roster</h2>
          <span className="eyebrow">{slots.length} players</span>
        </div>
        <div className="card-body">
          <div className="pos-grid">
            {positions.map(p => (
              <div key={p} className="pos-box">
                <div className="pos-name display">{p}</div>
                <div className="num pos-count">{byPos[p].length}</div>
                <div className="eyebrow">tiers</div>
              </div>
            ))}
          </div>
          <p style={{ marginBottom: 0 }}>
            Tiers are grouped by how good the player is expected to be, so tier 1 is the
            elite names and the last tier is mostly rookies and long shots. You take exactly
            one player from each, which means everyone ends up with a mix of stars and
            gambles. The deep tiers are where entries really separate.
          </p>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>Scoring</h2></div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="tbl">
            <tbody>
              <ScoreRow what="Passing yards" pts="1 per 25" />
              <ScoreRow what="Passing touchdown" pts="4" />
              <ScoreRow what="Interception thrown" pts="-2" neg />
              <ScoreRow what="Rushing or receiving yards" pts="1 per 10" />
              <ScoreRow what="Reception" pts="1 (full PPR)" />
              <ScoreRow what="Rushing or receiving touchdown" pts="6" />
              <ScoreRow what="Two-point conversion" pts="2" />
              <ScoreRow what="Fumble lost" pts="-2" neg />
              <ScoreRow what="Extra point made" pts="1" />
              <ScoreRow what="Field goal, under 40 yards" pts="3" />
              <ScoreRow what="Field goal, 40 to 49 yards" pts="4" />
              <ScoreRow what="Field goal, 50+ yards" pts="5" />
              <ScoreRow what="Missed field goal under 40" pts="-1" neg />
              <ScoreRow what="Missed extra point" pts="-1" neg />
            </tbody>
          </table>
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          <p style={{ fontSize: 14, color: "var(--chalk-dim)", marginBottom: 0 }}>
            Misses from 40 yards or longer are not penalised. Stats come from official
            box scores and update within a day or two of each game, so scores can move
            slightly when the league publishes corrections.
          </p>
        </div>
      </section>

      {pool.swap_opens_week && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2>Swaps</h2></div>
          <div className="card-body">
            <p>
              There is <strong>one swap window all season</strong>. It opens when week{" "}
              {pool.swap_opens_week - 1} finishes and shuts when week {pool.swap_opens_week}{" "}
              kicks off. Miss it and your roster is set for the rest of the year.
            </p>
            <p>
              In that window you can replace any player with someone from the same tier
              {Number(pool.swap_fee) > 0 ? ` for ${money(pool.swap_fee)} each` : ""}. Each
              roster slot can be changed once, so you could swap one player or every one
              of them, and you are not obliged to swap at all.
            </p>
            <p style={{ marginBottom: 0 }}>
              Points already banked stay yours. Everything the outgoing player earned in
              weeks 1 to {pool.swap_opens_week - 1} remains on your total, and the player
              coming in scores for you from week {pool.swap_opens_week} onward.
              {Number(pool.swap_fee) > 0 &&
                " Swap fees are added to the prize pool and go to the top finishers."}
            </p>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>Money</h2></div>
        <div className="card-body">
          <div className="stat-grid">
            <div className="stat">
              <div className="eyebrow">Entry fee</div>
              <div className="stat-val num">{money(pool.entry_fee)}</div>
            </div>
            <div className="stat">
              <div className="eyebrow">Entries paid</div>
              <div className="stat-val num">{pot?.paid_entries ?? 0}</div>
            </div>
            <div className="stat">
              <div className="eyebrow">Prize pool</div>
              <div className="stat-val num accent">{money(pot?.total_pot)}</div>
            </div>
          </div>

          {prizes.length > 0 ? (
            <>
              <table className="tbl" style={{ marginTop: 16 }}>
                <thead><tr><th>Prize</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  {weekly.length > 0 && (
                    <tr>
                      <td>Weekly high score, {weekly.length} weeks</td>
                      <td className="r num">{money(weekly[0].amount)} each</td>
                    </tr>
                  )}
                  {places.filter(p => p.kind === "PLACE")
                    .sort((a, b) => (a.place || 0) - (b.place || 0)).map(p => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td className="r num">{money(p.amount)}</td>
                    </tr>
                  ))}
                  {places.filter(p => p.kind === "REFUND").map(p => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td className="r num">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="rule-list">
                <li>Ties for a weekly high score split that week&rsquo;s prize evenly.</li>
                <li>A week is only paid once every roster has a complete score, so
                    winners are announced a day or two after the games.</li>
                <li>The prize pool is every paid entry fee{Number(pool.swap_fee) > 0 ? ", plus swap fees" : ""}.
                    More entries means a bigger pot, higher weekly prizes, and more
                    places paid.</li>
                {!pool.prizes_finalized &&
                  <li><strong>Amounts are provisional</strong> until every entry is in and paid.</li>}
              </ul>
            </>
          ) : (
            <p style={{ color: "var(--chalk-dim)", marginBottom: 0 }}>
              Payouts are set once all entries are in. The pot is every paid entry fee,
              and it is divided into weekly prizes, prizes for the top finishers, and
              the entry fee back for last place.
            </p>
          )}

          {deadline && (
            <p style={{ marginTop: 16, marginBottom: 0 }}>
              <strong>Picks lock {deadline.toLocaleString(undefined, {
                weekday: "long", month: "long", day: "numeric",
                hour: "numeric", minute: "2-digit",
              })}.</strong> Anything unpicked at that moment stays empty and scores nothing.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ScoreRow({ what, pts, neg }) {
  return (
    <tr>
      <td>{what}</td>
      <td className="r num" style={{ color: neg ? "var(--rust)" : "var(--amber)" }}>{pts}</td>
    </tr>
  );
}
