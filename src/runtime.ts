/**
 * The dsh-daily-sticky host Remote service (`ctx.sticky`, wire namespace
 * `sticky`). Registered as a TypertRemoteService so the Host Gateway's
 * source-mode discovery exports its @Remote methods to the Web client under
 * `/api/sticky/<method>`. Reads/writes the plain-JSON plan and appends to the
 * day's event log, enabling the weekly/monthly stats.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Datastore } from './datastore.ts'
import type {
  StickyPlan,
  StickyStats,
  StickyBacklog,
  AddTaskInput,
  EditTaskInput,
  SetDoneInput,
  SetNoteInput,
  DeleteTaskInput,
  MoveToBacklogInput,
  ExtractFromBacklogInput,
  StatsInput,
  AiExtractInput,
  AiExtractResult,
  ModelListResult,
} from './contract.ts'
import { computeStats } from './stats.ts'
import { currentModelLabel, extractTasksWithLLM, listModelChoices } from './llm.ts'

/** Daily sticky note service: plan CRUD + stats + AI 智能输入. */
export class StickyRuntime extends TypertRemoteService {
  /**
   * Register the service under the `sticky` key (the wire namespace).
   * @param ctx - owning cordis context.
   * @param ds - the shared datastore.
   */
  constructor(
    ctx: Context,
    private readonly ds: Datastore,
  ) {
    super(ctx, 'sticky')
  }

  /** Read today's (or an arbitrary date's) plan snapshot. */
  @Remote
  readPlan(date: string): StickyPlan {
    return this.ds.readPlan(date)
  }

  /** Append one task line to the plan for a given date. */
  @Remote
  addTask(input: AddTaskInput): StickyPlan {
    return this.ds.addTask(input.date, input.text, input.note)
  }

  /** Remove one task line (also logs the delete). */
  @Remote
  deleteTask(input: DeleteTaskInput): StickyPlan {
    return this.ds.deleteTask(input.date, input.task_id)
  }

  /** Toggle done state (check = complete, uncheck = undo). */
  @Remote
  setDone(input: SetDoneInput): StickyPlan {
    return this.ds.setDone(input.date, input.task_id, input.done)
  }

  /** Edit the task text. */
  @Remote
  editTask(input: EditTaskInput): StickyPlan {
    return this.ds.editTask(input.date, input.task_id, input.text)
  }

  /** Set (or clear) a task's note/备注. */
  @Remote
  setNote(input: SetNoteInput): StickyPlan {
    return this.ds.setNote(input.date, input.task_id, input.note)
  }

  /** "晚点说": move a day task into the cross-day 待办篮子. */
  @Remote
  moveToBacklog(input: MoveToBacklogInput): StickyPlan {
    return this.ds.moveToBacklog(input.date, input.task_id)
  }

  /** List the whole 待办篮子 (cross-day, not tied to any date). */
  @Remote
  listBacklog(): StickyBacklog {
    return this.ds.listBacklog()
  }

  /** Extract a basket task onto a chosen day as an active task. */
  @Remote
  extractFromBacklog(input: ExtractFromBacklogInput): StickyPlan {
    return this.ds.extractFromBacklog(input.backlog_id, input.date)
  }

  /** Permanently drop a basket task. */
  @Remote
  deleteFromBacklog(backlog_id: number): StickyBacklog {
    return this.ds.deleteFromBacklog(backlog_id)
  }

  /** Weekly/monthly aggregates with WoW/MoM deltas for a reference date. */
  @Remote
  stats(input: StatsInput): StickyStats {
    return computeStats(this.ds, input.date)
  }

  /**
   * "AI 智能输入": turn a messy paragraph into candidate sticky tasks using
   * DSH's current model (or an explicit override from the sticky model
   * selector). Candidates are returned for the user to confirm; nothing is
   * written yet (the client adds them via addTask).
   */
  @Remote
  async aiExtract(input: AiExtractInput): Promise<AiExtractResult> {
    const tasks = await extractTasksWithLLM(this.ctx, input.text, input.model)
    return { tasks, model: currentModelLabel(this.ctx) }
  }

  /** Enumerate DSH's usable models for the sticky note's model selector. */
  @Remote
  async listModels(): Promise<ModelListResult> {
    return listModelChoices(this.ctx)
  }
}
