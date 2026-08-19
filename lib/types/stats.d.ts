/**
 * dsh-daily-sticky stats: compute weekly/monthly aggregates with WoW/MoM deltas
 * from the per-day event logs. "This month" is month-to-date vs the same
 * stretch of the previous month (day-aligned), so ratios stay comparable.
 */
import type { Datastore } from './datastore.ts';
import type { StickyStats } from './contract.ts';
/**
 * Compute the full stats payload for a reference date (usually today).
 * @param ds - the datastore
 * @param date - reference ISO date (defaults to today). Defensive: any
 *   non-string (e.g. a `{date}` object from an older wire contract) is coerced
 *   so the calculation can never throw `x.split is not a function`.
 */
export declare function computeStats(ds: Datastore, date: unknown): StickyStats;
