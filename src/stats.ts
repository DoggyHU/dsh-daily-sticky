/**
 * dsh-daily-sticky stats: compute weekly/monthly aggregates with WoW/MoM deltas
 * from the per-day event logs. "This month" is month-to-date vs the same
 * stretch of the previous month (day-aligned), so ratios stay comparable.
 */
import type { Datastore } from './datastore.ts'
import type { StickyLog, StickyPeriodStat, StickyStats } from './contract.ts'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

function parse(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d }
}

/** Coerce whatever the caller handed us into a YYYY-MM-DD date string, or ''. */
function toDateString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value !== null && typeof value === 'object') {
    const inner = (value as { date?: unknown }).date
    if (typeof inner === 'string' && inner.trim()) return inner.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function todayKey(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** The Monday-start ISO week start date for a given date. */
function weekStartOf(date: string): string {
  const { y, m, d } = parse(date)
  const dt = new Date(y, m - 1, d)
  const dow = (dt.getDay() + 6) % 7 // 0 = Monday
  dt.setDate(dt.getDate() - dow)
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

/** Add whole days to an ISO date. */
function addDays(date: string, days: number): string {
  const { y, m, d } = parse(date)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

function addMonths(date: string, months: number): string {
  const { y, m, d } = parse(date)
  const dt = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  const day = Math.min(d, lastDay)
  dt.setDate(day)
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

function monthStartOf(date: string): string {
  const { y, m } = parse(date)
  return iso(y, m, 1)
}

interface RangeDays {
  from: string
  to: string
}

function daysInRange(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  // guard against infinite loop
  let guard = 0
  while (cur <= to && guard < 400) {
    out.push(cur)
    cur = addDays(cur, 1)
    guard += 1
  }
  return out
}

/**
 * Aggregate one range from the datastore's per-day logs.
 * @param ds - the datastore
 * @param range - [from, to] inclusive
 * @param capTo - only count events with tsDate (event's day) inside range
 */
function aggregate(ds: Datastore, range: RangeDays, logsCache: Map<string, StickyLog>): StickyPeriodStat {
  let added = 0
  let done = 0
  for (const day of daysInRange(range.from, range.to)) {
    let log = logsCache.get(day)
    if (log === undefined) {
      log = ds.readLogOrEmpty(day)
      logsCache.set(day, log)
    }
    for (const ev of log.events) {
      if (ev.action === 'added') added += 1
      else if (ev.action === 'done') done += 1
    }
  }
  const rate = added > 0 ? done / added : 0
  return { from: range.from, to: range.to, added, done, rate }
}

function pctDelta(cur: number, prev: number): number {
  return Math.round((cur - prev) * 1000) / 10 // one decimal percent point
}

/**
 * Compute the full stats payload for a reference date (usually today).
 * @param ds - the datastore
 * @param date - reference ISO date (defaults to today). Defensive: any
 *   non-string (e.g. a `{date}` object from an older wire contract) is coerced
 *   so the calculation can never throw `x.split is not a function`.
 */
export function computeStats(ds: Datastore, date: unknown): StickyStats {
  const ref = (() => {
    const s = toDateString(date)
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayKey()
  })()
  const logsCache = new Map<string, StickyLog>()

  const weekStart = weekStartOf(ref)
  const week: RangeDays = { from: weekStart, to: ref }
  const prevWeek: RangeDays = {
    from: addDays(weekStart, -7),
    to: addDays(weekStart, -1),
  }

  const monthStart = monthStartOf(ref)
  const month: RangeDays = { from: monthStart, to: ref }
  // month-to-date vs same stretch of previous month
  const prevMonthStart = addMonths(monthStart, -1)
  const monthLen = parse(ref).d // number of days elapsed this month (day of month)
  const prevMonth: RangeDays = {
    from: prevMonthStart,
    to: addDays(prevMonthStart, monthLen - 1),
  }

  const weekStat = aggregate(ds, week, logsCache)
  const prevWeekStat = aggregate(ds, prevWeek, logsCache)
  const monthStat = aggregate(ds, month, logsCache)
  const prevMonthStat = aggregate(ds, prevMonth, logsCache)

  return {
    week: weekStat,
    prevWeek: prevWeekStat,
    weekDoneDelta: weekStat.done - prevWeekStat.done,
    weekRateDeltaPct: pctDelta(weekStat.rate, prevWeekStat.rate),
    month: monthStat,
    prevMonth: prevMonthStat,
    monthDoneDelta: monthStat.done - prevMonthStat.done,
    monthRateDeltaPct: pctDelta(monthStat.rate, prevMonthStat.rate),
  }
}
