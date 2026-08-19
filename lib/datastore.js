// src/datastore.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import os from "node:os";
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function today(shiftDays = 0) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + shiftDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    if (raw.trim().length === 0) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function emptyPlan(date, savedAt = isoNow()) {
  return { date, tasks: [], saved_at: savedAt };
}
function emptyLog(date) {
  const t = isoNow();
  return { date, events: [], created_at: t, updated_at: t };
}
function withNote(base, note) {
  return note ? { ...base, note } : base;
}
var Datastore = class {
  constructor(dataDir) {
    this.dataDir = dataDir;
  }
  planPath(date) {
    return join(this.dataDir, "plan", `${date}.json`);
  }
  logPath(date) {
    return join(this.dataDir, "logs", `${date}.json`);
  }
  gapsPath() {
    return join(this.dataDir, "gaps.json");
  }
  /** 查漏 tags: session_id → {status, at}. Persists so handled sessions stay hidden. */
  readGapTags() {
    const raw = readJson(this.gapsPath());
    if (!raw) return {};
    const out = {};
    for (const [id, t] of Object.entries(raw)) {
      if (!id || !t) continue;
      const status = typeof t.status === "string" ? t.status : "ignored";
      const at = typeof t.at === "string" ? t.at : isoNow();
      if (status !== "added" && status !== "ignored") continue;
      out[id] = { status, at };
    }
    return out;
  }
  /** Tag one session as handled (added=已补录 / ignored=已忽略). */
  setGapTag(sessionId, status) {
    if (!sessionId) return;
    const tags = this.readGapTags();
    tags[sessionId] = { status, at: isoNow() };
    writeJson(this.gapsPath(), tags);
  }
  readPlan(date) {
    this.seedCarryover(date);
    const existing = readJson(this.planPath(date));
    if (existing === null) return emptyPlan(date);
    return {
      date,
      tasks: (existing.tasks ?? []).map((t) => withNote({
        task_id: t.task_id,
        text: t.text,
        date: t.date ?? date,
        done: Boolean(t.done),
        created_at: t.created_at ?? isoNow(),
        done_at: t.done_at ?? null,
        origin_date: t.origin_date ?? (t.date ?? date)
      }, t.note)),
      saved_at: existing.saved_at ?? isoNow()
    };
  }
  /**
   * When a new day's plan does not exist yet, seed it with the unfinished
   * tasks carried from every prior day (each keeping its original creation
   * date). Idempotent: after the first seed the file exists, so a later read
   * never re-runs it. Only writes when there is something to carry.
   */
  seedCarryover(date) {
    if (existsSync(this.planPath(date))) return;
    const prior = this.collectUnfinishedPrior(date);
    if (prior.length === 0) return;
    let maxId = 0;
    const now = isoNow();
    const tasks = prior.map((t) => withNote({
      task_id: ++maxId,
      text: t.text,
      date,
      done: false,
      created_at: t.created_at ?? now,
      done_at: null,
      origin_date: t.origin_date ?? t.date
    }, t.note));
    writeJson(this.planPath(date), { date, tasks, saved_at: now });
  }
  /** Unfinished tasks from every existing plan file dated strictly before `date`. */
  collectUnfinishedPrior(date) {
    let files;
    try {
      files = readdirSync(join(this.dataDir, "plan")).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    for (const f of files) {
      const d = f.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d >= date) continue;
      const plan = readJson(join(this.dataDir, "plan", f));
      if (!plan || !Array.isArray(plan.tasks)) continue;
      for (const t of plan.tasks) {
        if (!t || t.done !== false || typeof t.text !== "string" || !t.text.trim()) continue;
        const key = `${t.origin_date ?? d}|${t.created_at ?? ""}|${t.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(t);
      }
    }
    found.sort((a, b) => (a.created_at ?? a.date).localeCompare(b.created_at ?? b.date));
    return found;
  }
  writePlan(plan) {
    const next = { ...plan, saved_at: isoNow() };
    writeJson(this.planPath(next.date), next);
    return next;
  }
  readLog(date) {
    const existing = readJson(this.logPath(date));
    if (existing === null) return emptyLog(date);
    return {
      date,
      events: existing.events ?? [],
      created_at: existing.created_at ?? isoNow(),
      updated_at: existing.updated_at ?? isoNow()
    };
  }
  /** Append an event and persist the log (immutable update). */
  appendEvent(date, event) {
    const log = this.readLog(date);
    const next = {
      date: log.date,
      events: [...log.events, event],
      created_at: log.created_at,
      updated_at: isoNow()
    };
    writeJson(this.logPath(date), next);
  }
  /** Read a plan for an arbitrary date (for stats), returns raw or empty. */
  readPlanOrEmpty(date) {
    return this.readPlan(date);
  }
  readLogOrEmpty(date) {
    return this.readLog(date);
  }
  /** Mutations below all write plan + append log atomically-ish. */
  addTask(date, text, note) {
    const plan = this.readPlan(date);
    const maxId = plan.tasks.reduce((m, t) => Math.max(m, t.task_id), 0);
    const task = withNote({
      task_id: maxId + 1,
      text,
      date,
      done: false,
      created_at: isoNow(),
      done_at: null
    }, note);
    const saved = this.writePlan({ ...plan, tasks: [...plan.tasks, task] });
    this.appendEvent(date, withNote({ action: "added", task_id: task.task_id, text, ts: isoNow() }, note));
    return saved;
  }
  deleteTask(date, taskId) {
    const plan = this.readPlan(date);
    const target = plan.tasks.find((t) => t.task_id === taskId);
    const saved = this.writePlan({ ...plan, tasks: plan.tasks.filter((t) => t.task_id !== taskId) });
    this.appendEvent(date, { action: "deleted", task_id: taskId, text: target?.text, ts: isoNow() });
    return saved;
  }
  setDone(date, taskId, done) {
    const plan = this.readPlan(date);
    const target = plan.tasks.find((t) => t.task_id === taskId);
    const tasks = plan.tasks.map((t) => t.task_id !== taskId ? t : {
      ...t,
      done,
      done_at: done ? t.done_at ?? isoNow() : null
    });
    const saved = this.writePlan({ ...plan, tasks });
    this.appendEvent(date, { action: done ? "done" : "undone", task_id: taskId, ts: isoNow() });
    return saved;
  }
  editTask(date, taskId, text) {
    const plan = this.readPlan(date);
    const target = plan.tasks.find((t) => t.task_id === taskId);
    const old = target ? target.text : void 0;
    const tasks = plan.tasks.map((t) => t.task_id !== taskId ? t : { ...t, text });
    const saved = this.writePlan({ ...plan, tasks });
    this.appendEvent(date, { action: "edited", task_id: taskId, old_text: old, new_text: text, ts: isoNow() });
    return saved;
  }
  setNote(date, taskId, note) {
    const plan = this.readPlan(date);
    const tasks = plan.tasks.map((t) => t.task_id !== taskId ? t : withNote({ ...t }, note));
    const saved = this.writePlan({ ...plan, tasks });
    this.appendEvent(date, withNote({ action: "note", task_id: taskId, ts: isoNow() }, note));
    return saved;
  }
  /** The date key (YYYY-MM-DD) for "today". */
  todayKey() {
    return today();
  }
};
function resolveDshHome() {
  const env = process.env.DSH_HOME;
  const trimmed = env && env.trim();
  return trimmed ? trimmed : join(os.homedir(), ".dsh");
}
function defaultDataDir() {
  return join(resolveDshHome(), "dsh-daily-sticky");
}
export {
  Datastore,
  defaultDataDir
};
//# sourceMappingURL=datastore.js.map
