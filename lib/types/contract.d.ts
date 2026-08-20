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
import { z } from 'zod';
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
/** One sticky task line. Remains on the note (middle-strikethrough) once done. */
export interface StickyTask {
    readonly task_id: number;
    /** The task text (e.g. "论文：黎老师文章 批注+意见"). */
    readonly text: string;
    /** The calendar date this task belongs to (YYYY-MM-DD). */
    readonly date: string;
    /** True = checked/done (shown struck through). */
    readonly done: boolean;
    /** Optional note appended to the line (like the original skill's 备注). */
    readonly note?: string;
    readonly created_at: string;
    /** Completion timestamp, null while not done. */
    readonly done_at: string | null;
    /** First day this task was created (YYYY-MM-DD); set when it rolls over to
     *  later days so the client can subscript 昨天/前天/3天前. */
    readonly origin_date?: string;
}
/** The plan document for one calendar day. */
export interface StickyPlan {
    readonly date: string;
    readonly tasks: StickyTask[];
    readonly saved_at: string;
}
/** One mutation typed by action (mirrors the original skill's logs event vocabulary). */
export type StickyLogAction = 'added' | 'done' | 'undone' | 'edited' | 'deleted' | 'note';
/** One logged event with a timestamp (fuels weekly/monthly + MoM/WoW stats). */
export interface StickyLogEvent {
    readonly action: StickyLogAction;
    readonly task_id: number;
    readonly text?: string;
    readonly old_text?: string;
    readonly new_text?: string;
    readonly note?: string;
    readonly ts: string;
}
/** The dated log document. */
export interface StickyLog {
    readonly date: string;
    readonly events: StickyLogEvent[];
    readonly created_at: string;
    readonly updated_at: string;
}
/** A single-stretch stat summary for one date range. */
export interface StickyPeriodStat {
    /** ISO date of the period start (inclusive). */
    readonly from: string;
    /** ISO date of the period end (inclusive, today for the current period). */
    readonly to: string;
    /** Tasks added within the period (from logs). */
    readonly added: number;
    /** Tasks completed within the period (done events in logs). */
    readonly done: number;
    /** Completion rate 0..1 (done / added), 0 when nothing added. */
    readonly rate: number;
}
/** The stats payload the client renders: current vs previous with deltas. */
export interface StickyStats {
    readonly week: StickyPeriodStat;
    readonly prevWeek: StickyPeriodStat;
    /** Week-over-week: signed delta of `done` count. */
    readonly weekDoneDelta: number;
    /** Week-over-week completion rate delta (percentage points, signed). */
    readonly weekRateDeltaPct: number;
    readonly month: StickyPeriodStat;
    readonly prevMonth: StickyPeriodStat;
    /** Month-over-month: signed delta of `done` count. */
    readonly monthDoneDelta: number;
    /** Month-over-month completion rate delta (percentage points, signed). */
    readonly monthRateDeltaPct: number;
}
export declare const stickyTaskSchema: z.ZodReadonly<z.ZodObject<{
    task_id: z.ZodNumber;
    text: z.ZodString;
    date: z.ZodString;
    done: z.ZodBoolean;
    note: z.ZodOptional<z.ZodString>;
    created_at: z.ZodString;
    done_at: z.ZodNullable<z.ZodString>;
    origin_date: z.ZodOptional<z.ZodString>;
}, z.core.$strip>>;
export declare const stickyPlanSchema: z.ZodReadonly<z.ZodObject<{
    date: z.ZodString;
    tasks: z.ZodArray<z.ZodReadonly<z.ZodObject<{
        task_id: z.ZodNumber;
        text: z.ZodString;
        date: z.ZodString;
        done: z.ZodBoolean;
        note: z.ZodOptional<z.ZodString>;
        created_at: z.ZodString;
        done_at: z.ZodNullable<z.ZodString>;
        origin_date: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    saved_at: z.ZodString;
}, z.core.$strip>>;
export declare const stickyLogEventSchema: z.ZodReadonly<z.ZodObject<{
    action: z.ZodEnum<{
        added: "added";
        done: "done";
        undone: "undone";
        edited: "edited";
        deleted: "deleted";
        note: "note";
    }>;
    task_id: z.ZodNumber;
    text: z.ZodOptional<z.ZodString>;
    old_text: z.ZodOptional<z.ZodString>;
    new_text: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
    ts: z.ZodString;
}, z.core.$strip>>;
export declare const stickyLogSchema: z.ZodReadonly<z.ZodObject<{
    date: z.ZodString;
    events: z.ZodArray<z.ZodReadonly<z.ZodObject<{
        action: z.ZodEnum<{
            added: "added";
            done: "done";
            undone: "undone";
            edited: "edited";
            deleted: "deleted";
            note: "note";
        }>;
        task_id: z.ZodNumber;
        text: z.ZodOptional<z.ZodString>;
        old_text: z.ZodOptional<z.ZodString>;
        new_text: z.ZodOptional<z.ZodString>;
        note: z.ZodOptional<z.ZodString>;
        ts: z.ZodString;
    }, z.core.$strip>>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>>;
export declare const stickyStatsSchema: z.ZodReadonly<z.ZodObject<{
    week: z.ZodReadonly<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        added: z.ZodNumber;
        done: z.ZodNumber;
        rate: z.ZodNumber;
    }, z.core.$strip>>;
    prevWeek: z.ZodReadonly<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        added: z.ZodNumber;
        done: z.ZodNumber;
        rate: z.ZodNumber;
    }, z.core.$strip>>;
    weekDoneDelta: z.ZodNumber;
    weekRateDeltaPct: z.ZodNumber;
    month: z.ZodReadonly<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        added: z.ZodNumber;
        done: z.ZodNumber;
        rate: z.ZodNumber;
    }, z.core.$strip>>;
    prevMonth: z.ZodReadonly<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        added: z.ZodNumber;
        done: z.ZodNumber;
        rate: z.ZodNumber;
    }, z.core.$strip>>;
    monthDoneDelta: z.ZodNumber;
    monthRateDeltaPct: z.ZodNumber;
}, z.core.$strip>>;
/** Wire codec: an "add one line" request. */
export declare const addTaskInputSchema: z.ZodReadonly<z.ZodObject<{
    date: z.ZodString;
    text: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>>;
/** Wire codec: an "edit text" request. */
export declare const editTaskInputSchema: z.ZodReadonly<z.ZodObject<{
    date: z.ZodString;
    task_id: z.ZodNumber;
    text: z.ZodString;
}, z.core.$strip>>;
/** Wire codec: a "set done/undone" request. */
export declare const setDoneInputSchema: z.ZodReadonly<z.ZodObject<{
    date: z.ZodString;
    task_id: z.ZodNumber;
    done: z.ZodBoolean;
}, z.core.$strip>>;
/** Wire codec: a "set note" request. */
export declare const setNoteInputSchema: z.ZodReadonly<z.ZodObject<{
    date: z.ZodString;
    task_id: z.ZodNumber;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>>;
/** Wire codec: a "delete" request. */
export declare const deleteTaskInputSchema: z.ZodReadonly<z.ZodObject<{
    date: z.ZodString;
    task_id: z.ZodNumber;
}, z.core.$strip>>;
/** Wire codec: a date string for stats. */
export declare const statsInputSchema: z.ZodReadonly<z.ZodObject<{
    date: z.ZodString;
}, z.core.$strip>>;
/** Wire codec: "AI 智能输入" — one messy paragraph to turn into tasks. */
export declare const aiExtractInputSchema: z.ZodReadonly<z.ZodObject<{
    text: z.ZodString;
    model: z.ZodOptional<z.ZodReadonly<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>>;
/** Wire codec: one model choice exposed by the sticky model selector. */
export declare const modelChoiceSchema: z.ZodReadonly<z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    display_name: z.ZodString;
}, z.core.$strip>>;
/** Wire codec: the list of models DSH can use (for the sticky model selector). */
export declare const modelListResultSchema: z.ZodReadonly<z.ZodObject<{
    current: z.ZodNullable<z.ZodReadonly<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
    }, z.core.$strip>>>;
    options: z.ZodArray<z.ZodReadonly<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        display_name: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>>;
/** Wire codec: one task proposed by the AI extraction pass. */
export declare const aiExtractTaskSchema: z.ZodReadonly<z.ZodObject<{
    text: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>>;
/** Wire codec: the AI extraction result. */
export declare const aiExtractResultSchema: z.ZodReadonly<z.ZodObject<{
    tasks: z.ZodArray<z.ZodReadonly<z.ZodObject<{
        text: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    model: z.ZodString;
}, z.core.$strip>>;
export type DateInput = string;
export interface AddTaskInput {
    readonly date: string;
    readonly text: string;
    readonly note?: string;
}
export interface EditTaskInput {
    readonly date: string;
    readonly task_id: number;
    readonly text: string;
}
export interface SetDoneInput {
    readonly date: string;
    readonly task_id: number;
    readonly done: boolean;
}
export interface SetNoteInput {
    readonly date: string;
    readonly task_id: number;
    readonly note?: string;
}
export interface DeleteTaskInput {
    readonly date: string;
    readonly task_id: number;
}
export interface StatsInput {
    readonly date: string;
}
export interface AiExtractInput {
    readonly text: string;
    readonly model?: {
        readonly provider: string;
        readonly model: string;
    };
}
export interface AiExtractTask {
    readonly text: string;
    readonly note?: string;
}
export interface AiExtractResult {
    readonly tasks: AiExtractTask[];
    readonly model: string;
}
export interface ModelChoice {
    readonly provider: string;
    readonly model: string;
    readonly display_name: string;
}
export interface ModelListResult {
    readonly current: {
        readonly provider: string;
        readonly model: string;
    } | null;
    readonly options: ModelChoice[];
}
/** The sticky Remote namespace's strict invocation descriptors. */
export declare const STICKY_INVOCATIONS: readonly InvocationDescriptor[];
