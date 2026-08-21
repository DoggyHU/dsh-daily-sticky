/**
 * dsh-daily-sticky host data layer: plain-JSON-by-day file I/O.
 *
 * Layout under a configurable data dir (default `<DSH_HOME>/dsh-daily-sticky`):
 *   plan/YYYY-MM-DD.json   current day's note snapshot (tasks + done state)
 *   logs/YYYY-MM-DD.json   event log for that day (added/done/undone/edited/note/deleted)
 *
 * Files are written with UTF-8, no BOM, 2-space indent — the same conventions
 * as the legacy tomato pipeline so the AI can read/write them directly.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import os from 'node:os'
import type {
  StickyPlan,
  StickyLog,
  StickyLogEvent,
  StickyTask,
  BacklogTask,
  StickyBacklog,
} from './contract.ts'

function isoNow(): string {
  return new Date().toISOString()
}

function today(shiftDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + shiftDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface JsonLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    if (raw.trim().length === 0) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(path: string, value: JsonLike): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function emptyPlan(date: string, savedAt = isoNow()): StickyPlan {
  return { date, tasks: [], saved_at: savedAt }
}

function emptyLog(date: string): StickyLog {
  const t = isoNow()
  return { date, events: [], created_at: t, updated_at: t }
}

/** Build an object that never carries `note: undefined` (the gateway's JSON
 *  safety check rejects undefined property values, so omit note when absent). */
function withNote<T extends object>(base: T, note: string | undefined): T & { note?: string } {
  return note ? { ...base, note } : base
}

/** Storage namespace wrapping a resolved data dir. */
export class Datastore {
  constructor(
    private readonly dataDir: string,
  ) {}

  planPath(date: string): string {
    return join(this.dataDir, 'plan', `${date}.json`)
  }

  logPath(date: string): string {
    return join(this.dataDir, 'logs', `${date}.json`)
  }

  backlogPath(): string {
    return join(this.dataDir, 'backlog.json')
  }

  private emptyBacklog(): StickyBacklog {
    return { tasks: [], saved_at: isoNow() }
  }

  readBacklog(): StickyBacklog {
    const existing = readJson<StickyBacklog>(this.backlogPath())
    if (existing === null) return this.emptyBacklog()
    return {
      tasks: (existing.tasks ?? []).map((t: BacklogTask) => withNote({
        backlog_id: t.backlog_id,
        text: t.text,
        created_at: t.created_at ?? isoNow(),
        moved_at: t.moved_at ?? isoNow(),
        origin_date: t.origin_date ?? today(),
      }, t.note)),
      saved_at: existing.saved_at ?? isoNow(),
    }
  }

  private writeBacklog(backlog: StickyBacklog): StickyBacklog {
    const next: StickyBacklog = { tasks: backlog.tasks, saved_at: isoNow() }
    writeJson(this.backlogPath(), next)
    return next
  }

  /** "晚点说": pull a task out of a day's plan and park it in the 待办篮子. */
  moveToBacklog(date: string, taskId: number): StickyPlan {
    const plan = this.readPlan(date)
    const target = plan.tasks.find(t => t.task_id === taskId)
    if (!target) return plan
    const saved = this.writePlan({
      ...plan,
      tasks: plan.tasks.filter(t => t.task_id !== taskId),
    })
    const backlog = this.readBacklog()
    const maxId = backlog.tasks.reduce((m, t) => Math.max(m, t.backlog_id), 0)
    const parked: BacklogTask = {
      backlog_id: maxId + 1,
      text: target.text,
      ...(target.note ? { note: target.note } : {}),
      created_at: target.created_at ?? isoNow(),
      moved_at: isoNow(),
      origin_date: target.origin_date ?? target.date ?? date,
    }
    this.writeBacklog({ tasks: [...backlog.tasks, parked], saved_at: isoNow() })
    this.appendEvent(date, { action: 'deleted', task_id: taskId, text: target.text, ts: isoNow() })
    return saved
  }

  listBacklog(): StickyBacklog {
    return this.readBacklog()
  }

  /** "提取到今天": take a basket task out and make it an active task on `date`. */
  extractFromBacklog(backlogId: number, date: string): StickyPlan {
    const backlog = this.readBacklog()
    const target = backlog.tasks.find(t => t.backlog_id === backlogId)
    if (!target) return this.readPlan(date)
    this.writeBacklog({ tasks: backlog.tasks.filter(t => t.backlog_id !== backlogId), saved_at: isoNow() })
    const plan = this.readPlan(date)
    const maxId = plan.tasks.reduce((m, t) => Math.max(m, t.task_id), 0)
    const task: StickyTask = withNote({
      task_id: maxId + 1,
      text: target.text,
      date,
      done: false,
      created_at: target.created_at ?? isoNow(),
      done_at: null,
      origin_date: target.origin_date ?? date,
    }, target.note)
    const saved = this.writePlan({ ...plan, tasks: [...plan.tasks, task] })
    this.appendEvent(date, withNote({ action: 'added', task_id: task.task_id, text: target.text, ts: isoNow() }, target.note))
    return saved
  }

  /** Permanently drop a basket task (does not touch any day plan). */
  deleteFromBacklog(backlogId: number): StickyBacklog {
    const backlog = this.readBacklog()
    const target = backlog.tasks.find(t => t.backlog_id === backlogId)
    if (!target) return backlog
    return this.writeBacklog({ tasks: backlog.tasks.filter(t => t.backlog_id !== backlogId), saved_at: isoNow() })
  }

  readPlan(date: string): StickyPlan {
    this.seedCarryover(date)
    const existing = readJson<StickyPlan>(this.planPath(date))
    if (existing === null) return emptyPlan(date)
    // Normalize: ensure tasks shape; never emit `note: undefined`; keep the
    // roll-over origin date so the client can subscript 昨天/前天/3天前.
    return {
      date,
      tasks: (existing.tasks ?? []).map((t: StickyTask) => withNote({
        task_id: t.task_id,
        text: t.text,
        date: t.date ?? date,
        done: Boolean(t.done),
        created_at: t.created_at ?? isoNow(),
        done_at: t.done_at ?? null,
        origin_date: t.origin_date ?? (t.date ?? date),
      }, t.note)),
      saved_at: existing.saved_at ?? isoNow(),
    }
  }

  /**
   * When a new day's plan does not exist yet, seed it with the unfinished
   * tasks carried from every prior day (each keeping its original creation
   * date). Idempotent: after the first seed the file exists, so a later read
   * never re-runs it. Only writes when there is something to carry.
   */
  private seedCarryover(date: string): void {
    if (existsSync(this.planPath(date))) return
    const prior = this.collectUnfinishedPrior(date)
    if (prior.length === 0) return
    let maxId = 0
    const now = isoNow()
    const tasks = prior.map(t => withNote({
      task_id: ++maxId,
      text: t.text,
      date,
      done: false,
      created_at: t.created_at ?? now,
      done_at: null,
      origin_date: t.origin_date ?? t.date,
    }, t.note))
    writeJson(this.planPath(date), { date, tasks, saved_at: now })
  }

  /** Unfinished tasks from every existing plan file dated strictly before `date`. */
  private collectUnfinishedPrior(date: string): StickyTask[] {
    let files: string[]
    try {
      files = readdirSync(join(this.dataDir, 'plan')).filter(f => f.endsWith('.json'))
    } catch {
      return []
    }
    const found: StickyTask[] = []
    const seen = new Set<string>()
    for (const f of files) {
      const d = f.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d >= date) continue
      const plan = readJson<StickyPlan>(join(this.dataDir, 'plan', f))
      if (!plan || !Array.isArray(plan.tasks)) continue
      for (const t of plan.tasks) {
        if (!t || t.done !== false || typeof t.text !== 'string' || !t.text.trim()) continue
        // The same task may appear in several consecutive day files as it
        // rolls forward; keep only its first (origin) copy.
        const key = `${t.origin_date ?? d}|${t.created_at ?? ''}|${t.text}`
        if (seen.has(key)) continue
        seen.add(key)
        found.push(t)
      }
    }
    // Oldest first: the most long-pending items surface at the top.
    found.sort((a, b) => (a.created_at ?? a.date).localeCompare(b.created_at ?? b.date))
    return found
  }

  writePlan(plan: StickyPlan): StickyPlan {
    const next: StickyPlan = { ...plan, saved_at: isoNow() }
    writeJson(this.planPath(next.date), next)
    return next
  }

  readLog(date: string): StickyLog {
    const existing = readJson<StickyLog>(this.logPath(date))
    if (existing === null) return emptyLog(date)
    return {
      date,
      events: existing.events ?? [],
      created_at: existing.created_at ?? isoNow(),
      updated_at: existing.updated_at ?? isoNow(),
    }
  }

  /** Append an event and persist the log (immutable update). */
  appendEvent(date: string, event: StickyLogEvent): void {
    const log = this.readLog(date)
    const next: StickyLog = {
      date: log.date,
      events: [...log.events, event],
      created_at: log.created_at,
      updated_at: isoNow(),
    }
    writeJson(this.logPath(date), next)
  }

  /** Read a plan for an arbitrary date (for stats), returns raw or empty. */
  readPlanOrEmpty(date: string): StickyPlan {
    return this.readPlan(date)
  }

  readLogOrEmpty(date: string): StickyLog {
    return this.readLog(date)
  }

  /** Mutations below all write plan + append log atomically-ish. */
  addTask(date: string, text: string, note?: string): StickyPlan {
    const plan = this.readPlan(date)
    const maxId = plan.tasks.reduce((m, t) => Math.max(m, t.task_id), 0)
    const task: StickyTask = withNote({
      task_id: maxId + 1,
      text,
      date,
      done: false,
      created_at: isoNow(),
      done_at: null,
    }, note)
    const saved = this.writePlan({ ...plan, tasks: [...plan.tasks, task] })
    this.appendEvent(date, withNote({ action: 'added', task_id: task.task_id, text, ts: isoNow() }, note))
    return saved
  }

  deleteTask(date: string, taskId: number): StickyPlan {
    const plan = this.readPlan(date)
    const target = plan.tasks.find(t => t.task_id === taskId)
    const saved = this.writePlan({ ...plan, tasks: plan.tasks.filter(t => t.task_id !== taskId) })
    this.appendEvent(date, { action: 'deleted', task_id: taskId, text: target?.text, ts: isoNow() })
    return saved
  }

  setDone(date: string, taskId: number, done: boolean): StickyPlan {
    const plan = this.readPlan(date)
    const target = plan.tasks.find(t => t.task_id === taskId)
    const tasks = plan.tasks.map(t => t.task_id !== taskId ? t : {
      ...t,
      done,
      done_at: done ? (t.done_at ?? isoNow()) : null,
    })
    const saved = this.writePlan({ ...plan, tasks })
    this.appendEvent(date, { action: done ? 'done' : 'undone', task_id: taskId, ts: isoNow() })
    return saved
  }

  editTask(date: string, taskId: number, text: string): StickyPlan {
    const plan = this.readPlan(date)
    const target = plan.tasks.find(t => t.task_id === taskId)
    const old = target ? target.text : undefined
    const tasks = plan.tasks.map(t => t.task_id !== taskId ? t : { ...t, text })
    const saved = this.writePlan({ ...plan, tasks })
    this.appendEvent(date, { action: 'edited', task_id: taskId, old_text: old, new_text: text, ts: isoNow() })
    return saved
  }

  setNote(date: string, taskId: number, note?: string): StickyPlan {
    const plan = this.readPlan(date)
    const tasks = plan.tasks.map(t => t.task_id !== taskId ? t : withNote({ ...t }, note))
    const saved = this.writePlan({ ...plan, tasks })
    this.appendEvent(date, withNote({ action: 'note', task_id: taskId, ts: isoNow() }, note))
    return saved
  }

  /** The date key (YYYY-MM-DD) for "today". */
  todayKey(): string {
    return today()
  }
}

/** Resolve the DSH home root: `$DSH_HOME` (trimmed) else `~/.dsh`. */
function resolveDshHome(): string {
  const env = process.env.DSH_HOME
  const trimmed = env && env.trim()
  return trimmed ? trimmed : join(os.homedir(), '.dsh')
}

/** Resolve the default data dir from the DSH home root. */
export function defaultDataDir(): string {
  return join(resolveDshHome(), 'dsh-daily-sticky')
}
