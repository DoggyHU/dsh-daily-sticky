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
import type { StickyPlan, StickyStats, StickyBacklog, AddTaskInput, EditTaskInput, SetDoneInput, SetNoteInput, DeleteTaskInput, MoveToBacklogInput, ExtractFromBacklogInput, StatsInput, AiExtractInput, AiExtractResult, ModelListResult } from './contract.ts';
/** Daily sticky note service: plan CRUD + stats + AI 智能输入. */
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
    /** "晚点说": move a day task into the cross-day 待办篮子. */
    moveToBacklog(input: MoveToBacklogInput): StickyPlan;
    /** List the whole 待办篮子 (cross-day, not tied to any date). */
    listBacklog(): StickyBacklog;
    /** Extract a basket task onto a chosen day as an active task. */
    extractFromBacklog(input: ExtractFromBacklogInput): StickyPlan;
    /** Permanently drop a basket task. */
    deleteFromBacklog(backlog_id: number): StickyBacklog;
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
}
