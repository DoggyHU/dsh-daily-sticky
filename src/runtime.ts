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
  AddTaskInput,
  EditTaskInput,
  SetDoneInput,
  SetNoteInput,
  DeleteTaskInput,
  StatsInput,
  AiExtractInput,
  AiExtractResult,
  ModelListResult,
  GapScanInput,
  GapScanResult,
  TagGapsInput,
} from './contract.ts'
import { computeStats } from './stats.ts'
import { currentModelLabel, extractTasksWithLLM, listModelChoices } from './llm.ts'
import { scanGapSessions, sessionsRoot } from './scan.ts'

/** Daily sticky note service: plan CRUD + stats + AI 智能输入 + 查漏. */
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

  /**
   * "查漏": scan DSH sessions updated in the last `days` days (default 2) for
   * conversations with an unanswered user turn, so the user can see what is
   * still unresolved and add items to today's note. Sessions already tagged as
   * handled (added/ignored) are excluded so 查漏 never loops forever.
   */
  @Remote
  scanGaps(input?: GapScanInput): GapScanResult {
    const days = input?.days ?? 2
    const sessions = scanGapSessions(sessionsRoot(), days)
    const tags = this.ds.readGapTags()
    const visible = sessions.filter(s => !tags[s.sessionId])
    const excluded = sessions.length - visible.length
    return {
      window_days: days,
      scanned: sessions.length,
      excluded,
      unread: visible.filter(s => s.unread).length,
      sessions: visible.map(s => ({
        session_id: s.sessionId,
        title: s.title,
        workspace: s.workspace,
        workspace_label: s.workspaceLabel,
        last_active: s.lastActive,
        unread: s.unread,
        status: s.status,
        last_user_text: s.lastUserText,
        excerpt: s.excerpt,
      })),
    }
  }

  /**
   * "查漏已处理": batch-tag sessions as added (补录过) or ignored (主动忽略) so
   * later 查漏 runs stop listing them. Returns the refreshed scan result.
   */
  @Remote
  tagGaps(input: TagGapsInput): GapScanResult {
    for (const item of input.sessions) this.ds.setGapTag(item.session_id, item.status)
    return this.scanGaps({ days: 2 })
  }
}
