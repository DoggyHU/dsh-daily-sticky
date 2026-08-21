/**
 * dsh-daily-sticky wire contract, shared verbatim by the host manifest
 * (`ctx.typert.register`) and the client contribution (`ctx.remote.$mount`).
 *
 * The service exposes a daily sticky note: read the plan for a date,
 * and perform CRUD mutations that also append to that day's event log.
 * Data files are plain JSON on disk (`plan/YYYY-MM-DD.json`, `logs/YYYY-MM-DD.json`)
 * so the AI agent can read/write the same files outside the plugin (the
 * "AI 随时新增" entry point).
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

/** One sticky task line. Remains on the note (middle-strikethrough) once done. */
export interface StickyTask {
  readonly task_id: number
  /** The task text (e.g. "论文：黎老师文章 批注+意见"). */
  readonly text: string
  /** The calendar date this task belongs to (YYYY-MM-DD). */
  readonly date: string
  /** True = checked/done (shown struck through). */
  readonly done: boolean
  /** Optional note appended to the line (like the original skill's 备注). */
  readonly note?: string
  readonly created_at: string
  /** Completion timestamp, null while not done. */
  readonly done_at: string | null
  /** First day this task was created (YYYY-MM-DD); set when it rolls over to
   *  later days so the client can subscript 昨天/前天/3天前. */
  readonly origin_date?: string
}

/** The plan document for one calendar day. */
export interface StickyPlan {
  readonly date: string
  readonly tasks: StickyTask[]
  readonly saved_at: string
}

/**
 * One deferred ("晚点说") task sitting in the cross-day 待办篮子. Unlike a day
 * task, a basket task is not bound to any calendar day: it stays in the basket
 * until the user extracts it back onto a chosen day (becoming an active task)
 * or deletes it.
 */
export interface BacklogTask {
  /** Stable id within the basket. */
  readonly backlog_id: number
  readonly text: string
  readonly note?: string
  /** When the task was first created (any day). */
  readonly created_at: string
  /** When it was parked into the basket via "晚点说". */
  readonly moved_at: string
  /** The day it was parked from (YYYY-MM-DD), for a "3天前" style hint. */
  readonly origin_date: string
}

/** The persistent 待办篮子 document (one cross-day basket). */
export interface StickyBacklog {
  readonly tasks: BacklogTask[]
  readonly saved_at: string
}

/** One mutation typed by action (mirrors the original skill's logs event vocabulary). */
export type StickyLogAction =
  | 'added'
  | 'done'
  | 'undone'
  | 'edited'
  | 'deleted'
  | 'note'

/** One logged event with a timestamp (fuels weekly/monthly + MoM/WoW stats). */
export interface StickyLogEvent {
  readonly action: StickyLogAction
  readonly task_id: number
  readonly text?: string
  readonly old_text?: string
  readonly new_text?: string
  readonly note?: string
  readonly ts: string
}

/** The dated log document. */
export interface StickyLog {
  readonly date: string
  readonly events: StickyLogEvent[]
  readonly created_at: string
  readonly updated_at: string
}

/** A single-stretch stat summary for one date range. */
export interface StickyPeriodStat {
  /** ISO date of the period start (inclusive). */
  readonly from: string
  /** ISO date of the period end (inclusive, today for the current period). */
  readonly to: string
  /** Tasks added within the period (from logs). */
  readonly added: number
  /** Tasks completed within the period (done events in logs). */
  readonly done: number
  /** Completion rate 0..1 (done / added), 0 when nothing added. */
  readonly rate: number
}

/** The stats payload the client renders: current vs previous with deltas. */
export interface StickyStats {
  readonly week: StickyPeriodStat
  readonly prevWeek: StickyPeriodStat
  /** Week-over-week: signed delta of `done` count. */
  readonly weekDoneDelta: number
  /** Week-over-week completion rate delta (percentage points, signed). */
  readonly weekRateDeltaPct: number
  readonly month: StickyPeriodStat
  readonly prevMonth: StickyPeriodStat
  /** Month-over-month: signed delta of `done` count. */
  readonly monthDoneDelta: number
  /** Month-over-month completion rate delta (percentage points, signed). */
  readonly monthRateDeltaPct: number
}

// ---- Wire codecs (strict) ----

const tsSchema = z.string().min(1)
const textSchema = z.string().max(2000)

export const stickyTaskSchema = z.object({
  task_id: z.number().int().nonnegative(),
  text: textSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  done: z.boolean(),
  note: z.string().max(2000).optional(),
  created_at: tsSchema,
  done_at: tsSchema.nullable(),
  origin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).readonly()

export const stickyPlanSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z.array(stickyTaskSchema),
  saved_at: tsSchema,
}).readonly()

export const backlogTaskSchema = z.object({
  backlog_id: z.number().int().nonnegative(),
  text: textSchema,
  note: z.string().max(2000).optional(),
  created_at: tsSchema,
  moved_at: tsSchema,
  origin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).readonly()

export const stickyBacklogSchema = z.object({
  tasks: z.array(backlogTaskSchema),
  saved_at: tsSchema,
}).readonly()

export const stickyLogEventSchema = z.object({
  action: z.enum(['added', 'done', 'undone', 'edited', 'deleted', 'note']),
  task_id: z.number().int().nonnegative(),
  text: textSchema.optional(),
  old_text: textSchema.optional(),
  new_text: textSchema.optional(),
  note: z.string().max(2000).optional(),
  ts: tsSchema,
}).readonly()

export const stickyLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  events: z.array(stickyLogEventSchema),
  created_at: tsSchema,
  updated_at: tsSchema,
}).readonly()

const periodStatSchema = z.object({
  from: z.string(),
  to: z.string(),
  added: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
}).readonly()

export const stickyStatsSchema = z.object({
  week: periodStatSchema,
  prevWeek: periodStatSchema,
  weekDoneDelta: z.number().int(),
  weekRateDeltaPct: z.number(),
  month: periodStatSchema,
  prevMonth: periodStatSchema,
  monthDoneDelta: z.number().int(),
  monthRateDeltaPct: z.number(),
}).readonly()

/** Wire codec: an "add one line" request. */
export const addTaskInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: textSchema,
  note: z.string().max(2000).optional(),
}).readonly()

/** Wire codec: an "edit text" request. */
export const editTaskInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  task_id: z.number().int().nonnegative(),
  text: textSchema,
}).readonly()

/** Wire codec: a "set done/undone" request. */
export const setDoneInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  task_id: z.number().int().nonnegative(),
  done: z.boolean(),
}).readonly()

/** Wire codec: a "set note" request. */
export const setNoteInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  task_id: z.number().int().nonnegative(),
  note: z.string().max(2000).optional(),
}).readonly()

/** Wire codec: a "delete" request. */
export const deleteTaskInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  task_id: z.number().int().nonnegative(),
}).readonly()

/** Wire codec: "晚点说" — take a day task out of the plan and into the basket. */
export const moveToBacklogInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  task_id: z.number().int().nonnegative(),
}).readonly()

/** Wire codec: extract a basket task onto a chosen day as an active task. */
export const extractFromBacklogInputSchema = z.object({
  backlog_id: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).readonly()

/** Wire codec: a date string for stats. */
export const statsInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).readonly()

/** Wire codec: "AI 智能输入" — one messy paragraph to turn into tasks. */
export const aiExtractInputSchema = z.object({
  text: z.string().min(1).max(20000),
  /** Optional explicit model override; omitted = follow DSH's current model. */
  model: z.object({ provider: z.string().min(1), model: z.string().min(1) }).readonly().optional(),
}).readonly()

/** Wire codec: one model choice exposed by the sticky model selector. */
export const modelChoiceSchema = z.object({
  provider: z.string(),
  model: z.string(),
  /** Short display name for the selector (provider name · model name). */
  display_name: z.string(),
}).readonly()

/** Wire codec: the list of models DSH can use (for the sticky model selector). */
export const modelListResultSchema = z.object({
  /** Current default selection, when determinable (provider/model). */
  current: z.object({ provider: z.string(), model: z.string() }).readonly().nullable(),
  /** Every discoverable provider/model choice. */
  options: z.array(modelChoiceSchema),
}).readonly()

/** Wire codec: one task proposed by the AI extraction pass. */
export const aiExtractTaskSchema = z.object({
  text: z.string().max(2000),
  note: z.string().max(2000).optional(),
}).readonly()

/** Wire codec: the AI extraction result. */
export const aiExtractResultSchema = z.object({
  tasks: z.array(aiExtractTaskSchema),
  /** Short label of the model used (for display). */
  model: z.string(),
}).readonly()

// ---- Public input type aliases for the host runtime (from the wire schemas) ----
export type DateInput = string
export interface AddTaskInput { readonly date: string; readonly text: string; readonly note?: string }
export interface EditTaskInput { readonly date: string; readonly task_id: number; readonly text: string }
export interface SetDoneInput { readonly date: string; readonly task_id: number; readonly done: boolean }
export interface SetNoteInput { readonly date: string; readonly task_id: number; readonly note?: string }
export interface DeleteTaskInput { readonly date: string; readonly task_id: number }
export interface MoveToBacklogInput { readonly date: string; readonly task_id: number }
export interface ExtractFromBacklogInput { readonly backlog_id: number; readonly date: string }
export interface StatsInput { readonly date: string }
export interface AiExtractInput { readonly text: string; readonly model?: { readonly provider: string; readonly model: string } }
export interface AiExtractTask { readonly text: string; readonly note?: string }
export interface AiExtractResult { readonly tasks: AiExtractTask[]; readonly model: string }
export interface ModelChoice { readonly provider: string; readonly model: string; readonly display_name: string }
export interface ModelListResult { readonly current: { readonly provider: string; readonly model: string } | null; readonly options: ModelChoice[] }

/** The sticky Remote namespace's strict invocation descriptors. */
export const STICKY_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: 'dsh-daily-sticky#sticky/readPlan',
    service: 'sticky',
    namespace: 'sticky',
    method: 'readPlan',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'date',
      wire: 'date',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#Date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyPlan', schema: stickyPlanSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/addTask',
    service: 'sticky',
    namespace: 'sticky',
    method: 'addTask',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#AddTaskInput', schema: addTaskInputSchema },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyPlan', schema: stickyPlanSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/deleteTask',
    service: 'sticky',
    namespace: 'sticky',
    method: 'deleteTask',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#DeleteTaskInput', schema: deleteTaskInputSchema },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyPlan', schema: stickyPlanSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/setDone',
    service: 'sticky',
    namespace: 'sticky',
    method: 'setDone',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#SetDoneInput', schema: setDoneInputSchema },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyPlan', schema: stickyPlanSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/editTask',
    service: 'sticky',
    namespace: 'sticky',
    method: 'editTask',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#EditTaskInput', schema: editTaskInputSchema },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyPlan', schema: stickyPlanSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/setNote',
    service: 'sticky',
    namespace: 'sticky',
    method: 'setNote',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#SetNoteInput', schema: setNoteInputSchema },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyPlan', schema: stickyPlanSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/stats',
    service: 'sticky',
    namespace: 'sticky',
    method: 'stats',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StatsInput', schema: statsInputSchema },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyStats', schema: stickyStatsSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/aiExtract',
    service: 'sticky',
    namespace: 'sticky',
    method: 'aiExtract',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#AiExtractInput', schema: aiExtractInputSchema },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#AiExtractResult', schema: aiExtractResultSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/listModels',
    service: 'sticky',
    namespace: 'sticky',
    method: 'listModels',
    invocation: { kind: 'direct' },
    parameters: [],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#ModelListResult', schema: modelListResultSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/moveToBacklog',
    service: 'sticky',
    namespace: 'sticky',
    method: 'moveToBacklog',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#MoveToBacklogInput', schema: moveToBacklogInputSchema },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyPlan', schema: stickyPlanSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/listBacklog',
    service: 'sticky',
    namespace: 'sticky',
    method: 'listBacklog',
    invocation: { kind: 'direct' },
    parameters: [],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyBacklog', schema: stickyBacklogSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/extractFromBacklog',
    service: 'sticky',
    namespace: 'sticky',
    method: 'extractFromBacklog',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#ExtractFromBacklogInput', schema: extractFromBacklogInputSchema },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyPlan', schema: stickyPlanSchema },
  },
  {
    id: 'dsh-daily-sticky#sticky/deleteFromBacklog',
    service: 'sticky',
    namespace: 'sticky',
    method: 'deleteFromBacklog',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'backlog_id',
      wire: 'backlog_id',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#BacklogId', schema: z.number().int().nonnegative() },
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-daily-sticky#StickyBacklog', schema: stickyBacklogSchema },
  },
]
