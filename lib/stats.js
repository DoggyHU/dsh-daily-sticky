// src/stats.ts
function pad(n) {
  return String(n).padStart(2, "0");
}
function iso(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function parse(date) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}
function toDateString(value) {
  if (typeof value === "string") return value.trim();
  if (value !== null && typeof value === "object") {
    const inner = value.date;
    if (typeof inner === "string" && inner.trim()) return inner.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
function todayKey() {
  const d = /* @__PURE__ */ new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function weekStartOf(date) {
  const { y, m, d } = parse(date);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - dow);
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}
function addDays(date, days) {
  const { y, m, d } = parse(date);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}
function addMonths(date, months) {
  const { y, m, d } = parse(date);
  const dt = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  dt.setDate(day);
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}
function monthStartOf(date) {
  const { y, m } = parse(date);
  return iso(y, m, 1);
}
function daysInRange(from, to) {
  const out = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}
function aggregate(ds, range, logsCache) {
  let added = 0;
  let done = 0;
  for (const day of daysInRange(range.from, range.to)) {
    let log = logsCache.get(day);
    if (log === void 0) {
      log = ds.readLogOrEmpty(day);
      logsCache.set(day, log);
    }
    for (const ev of log.events) {
      if (ev.action === "added") added += 1;
      else if (ev.action === "done") done += 1;
    }
  }
  const rate = added > 0 ? done / added : 0;
  return { from: range.from, to: range.to, added, done, rate };
}
function pctDelta(cur, prev) {
  return Math.round((cur - prev) * 1e3) / 10;
}
function computeStats(ds, date) {
  const ref = (() => {
    const s = toDateString(date);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayKey();
  })();
  const logsCache = /* @__PURE__ */ new Map();
  const weekStart = weekStartOf(ref);
  const week = { from: weekStart, to: ref };
  const prevWeek = {
    from: addDays(weekStart, -7),
    to: addDays(weekStart, -1)
  };
  const monthStart = monthStartOf(ref);
  const month = { from: monthStart, to: ref };
  const prevMonthStart = addMonths(monthStart, -1);
  const monthLen = parse(ref).d;
  const prevMonth = {
    from: prevMonthStart,
    to: addDays(prevMonthStart, monthLen - 1)
  };
  const weekStat = aggregate(ds, week, logsCache);
  const prevWeekStat = aggregate(ds, prevWeek, logsCache);
  const monthStat = aggregate(ds, month, logsCache);
  const prevMonthStat = aggregate(ds, prevMonth, logsCache);
  return {
    week: weekStat,
    prevWeek: prevWeekStat,
    weekDoneDelta: weekStat.done - prevWeekStat.done,
    weekRateDeltaPct: pctDelta(weekStat.rate, prevWeekStat.rate),
    month: monthStat,
    prevMonth: prevMonthStat,
    monthDoneDelta: monthStat.done - prevMonthStat.done,
    monthRateDeltaPct: pctDelta(monthStat.rate, prevMonthStat.rate)
  };
}
export {
  computeStats
};
//# sourceMappingURL=stats.js.map
