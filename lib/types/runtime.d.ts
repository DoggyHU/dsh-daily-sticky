/**
 * The dsh-daily-sticky host Remote service (`ctx.sticky`, wire namespace
 * `sticky`). Registered as a TypertRemoteService so the Host Gateway's
 * source-mode discovery exports its @Remote methods to the Web client under
 * `/api/sticky/<method>`. Reads/writes the plain-JSON plan and appends to the
 * day's event log, enabling the weekly/monthly stats.
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Datastore } from './datastore.ts';
import type { StickyPlan, StickyStats, AddTaskInput, EditTaskInput, SetDoneInput, SetNoteInput, DeleteTaskInput, StatsInput, AiExtractInput, AiExtractResult, ModelListResult, GapScanInput, GapScanResult, TagGapsInput } from './contract.ts';
/** Daily sticky note service: plan CRUD + stats + AI 智能输入 + 查漏. */
export declare class StickyRuntime extends TypertRemoteService {
    private readonly ds;
    /**
     * Register the service under the `sticky` key (the wire namespace).
     * @param ctx - owning cordis context.
     * @param ds - the shared datastore.
     */
    constructor(ctx: Context, ds: Datastore);
    /** Read today's (or an arbitrary date's) plan snapshot. */
    readPlan(date: string): StickyPlan;
    /** Append one task line to the plan for a given date. */
    addTask(input: AddTaskInput): StickyPlan;
    /** Remove one task line (also logs the delete). */
    deleteTask(input: DeleteTaskInput): StickyPlan;
    /** Toggle done state (check = complete, uncheck = undo). */
    setDone(input: SetDoneInput): StickyPlan;
    /** Edit the task text. */
    editTask(input: EditTaskInput): StickyPlan;
    /** Set (or clear) a task's note/备注. */
    setNote(input: SetNoteInput): StickyPlan;
    /** Weekly/monthly aggregates with WoW/MoM deltas for a reference date. */
    stats(input: StatsInput): StickyStats;
    /**
     * "AI 智能输入": turn a messy paragraph into candidate sticky tasks using
     * DSH's current model (or an explicit override from the sticky model
     * selector). Candidates are returned for the user to confirm; nothing is
     * written yet (the client adds them via addTask).
     */
    aiExtract(input: AiExtractInput): Promise<AiExtractResult>;
    /** Enumerate DSH's usable models for the sticky note's model selector. */
    listModels(): Promise<ModelListResult>;
    /**
     * "查漏": scan DSH sessions updated in the last `days` days (default 2) for
     * conversations with an unanswered user turn, so the user can see what is
     * still unresolved and add items to today's note. Sessions already tagged as
     * handled (added/ignored) are excluded so 查漏 never loops forever.
     */
    scanGaps(input?: GapScanInput): GapScanResult;
    /**
     * "查漏已处理": batch-tag sessions as added (补录过) or ignored (主动忽略) so
     * later 查漏 runs stop listing them. Returns the refreshed scan result.
     */
    tagGaps(input: TagGapsInput): GapScanResult;
}
