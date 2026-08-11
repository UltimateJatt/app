// ============================================================
// prizePlan.js  -  works out the payout table
// ============================================================
// Rules, in the order money comes off the pot:
//   1. Last place gets their entry fee back (optional).
//   2. Weekly high score prizes, one per week.
//   3. Everything left is split across the paid places.
//
// Every amount is a whole dollar. Places below first are rounded
// UP, and first place takes whatever remains. That keeps the
// total exactly equal to the pot with no cent left stranded,
// and first place stays a whole number because everything else
// already is.
// ============================================================

/** How many places get paid, based on how many people are in. */
export function suggestPlaceCount(entries) {
  if (!entries || entries < 1) return 3;
  if (entries < 20) return 3;
  if (entries < 40) return 4;
  if (entries < 60) return 5;
  if (entries < 80) return 6;
  if (entries < 100) return 7;
  return 8;
}

/**
 * Weekly prize aimed at roughly sharePct of the pot, kept to tidy
 * round numbers, and never more than the pot can actually afford.
 * Returns 0 when there simply is not enough money for weekly prizes,
 * which is the honest answer for a pot of $20.
 */
export function suggestWeeklyPrize(pot, weeks, opts = {}) {
  const { refund = 0, placeCount = 3, sharePct = 45 } = opts;
  const available = Number(pot) - Number(refund);
  if (!weeks || available <= 0) return 0;

  // Every place needs at least a dollar left over, so this is the
  // most the weekly prizes could ever consume.
  const ceiling = (available - placeCount) / weeks;
  if (ceiling < 1) return 0;

  const target = (available * sharePct) / 100 / weeks;
  const tidy = target >= 5 ? Math.round(target / 5) * 5 : Math.round(target);

  // Step down through tidy values until one fits.
  for (const v of [tidy, tidy - 5, tidy - 10, Math.floor(ceiling), Math.floor(ceiling) - 1]) {
    if (v >= 1 && v <= ceiling) return v;
  }
  return 0;
}

const ordinal = n =>
  n === 1 ? "Champion" :
  n === 2 ? "Runner-up" :
  n === 3 ? "Third place" :
  n === 4 ? "Fourth place" :
  n === 5 ? "Fifth place" :
  n === 6 ? "Sixth place" :
  n === 7 ? "Seventh place" :
  `${n}th place`;

/**
 * Weight curve for the paid places. A gentle decay so first place
 * is clearly the prize worth chasing, without making fourth place
 * a rounding error.
 */
function weights(count) {
  return Array.from({ length: count }, (_, i) => 1 / Math.pow(i + 1, 1.15));
}

/**
 * Builds the full plan.
 * Returns { rows, pot, weeklyTotal, refund, placePool, valid, problem }
 */
export function buildPlan({
  pot,
  weeks,
  weeklyPrize,
  placeCount,
  refundLastPlace,
  entryFee,
  overrides = {},        // { "PLACE:1": 250 } to pin an amount
}) {
  const rows = [];
  const refund = refundLastPlace ? Math.ceil(Number(entryFee) || 0) : 0;
  const weeklyTotal = weeks * weeklyPrize;
  const placePool = pot - refund - weeklyTotal;

  if (placePool < placeCount) {
    return {
      rows: [], pot, weeklyTotal, refund, placePool, valid: false,
      problem:
        placePool < 0
          ? `Weekly prizes and the refund need $${(refund + weeklyTotal).toFixed(0)} but the pot is only $${pot.toFixed(0)}.`
          : `Only $${placePool.toFixed(0)} left for ${placeCount} places. Lower the weekly prize or pay fewer places.`,
    };
  }

  for (let w = 1; w <= weeks; w++) {
    rows.push({
      kind: "WEEKLY", week: w, place: null,
      label: `Week ${w}`, amount: weeklyPrize, sort_order: w,
    });
  }

  if (refund > 0) {
    rows.push({
      kind: "REFUND", week: null, place: null,
      label: "Last place, entry fee back", amount: refund, sort_order: 900,
    });
  }

  // Places 2..N round up; place 1 absorbs the remainder.
  const w = weights(placeCount);
  const wSum = w.reduce((a, b) => a + b, 0);
  const lower = [];
  for (let i = 1; i < placeCount; i++) {
    const key = `PLACE:${i + 1}`;
    const amt = overrides[key] != null
      ? Math.round(overrides[key])
      : Math.ceil((placePool * w[i]) / wSum);
    lower.push({ place: i + 1, amount: amt });
  }

  const lowerTotal = lower.reduce((a, p) => a + p.amount, 0);
  const firstKey = "PLACE:1";
  const first = overrides[firstKey] != null
    ? Math.round(overrides[firstKey])
    : placePool - lowerTotal;

  rows.push({
    kind: "PLACE", week: null, place: 1,
    label: ordinal(1), amount: first, sort_order: 1000,
  });
  for (const p of lower) {
    rows.push({
      kind: "PLACE", week: null, place: p.place,
      label: ordinal(p.place), amount: p.amount, sort_order: 1000 + p.place,
    });
  }

  const total = rows.reduce((a, r) => a + r.amount, 0);
  const off = +(total - pot).toFixed(2);

  return {
    rows, pot, weeklyTotal, refund, placePool,
    total, off,
    valid: Math.abs(off) < 0.005 && first > 0,
    problem:
      first <= 0
        ? "First place would get nothing. Pay fewer places or lower the weekly prize."
        : Math.abs(off) >= 0.005
        ? `Payouts total $${total.toFixed(2)} but the pot is $${pot.toFixed(2)}. Adjust an amount by $${Math.abs(off).toFixed(2)}.`
        : null,
  };
}
