import type { StickyPlan, StickyLog, StickyLogEvent } from './contract.ts';
/** Storage namespace wrapping a resolved data dir. */
export declare class Datastore {
    private readonly dataDir;
    constructor(dataDir: string);
    planPath(date: string): string;
    logPath(date: string): string;
    gapsPath(): string;
    /** 查漏 tags: session_id → {status, at}. Persists so handled sessions stay hidden. */
    readGapTags(): Record<string, {
        status: string;
        at: string;
    }>;
    /** Tag one session as handled (added=已补录 / ignored=已忽略). */
    setGapTag(sessionId: string, status: 'added' | 'ignored'): void;
    readPlan(date: string): StickyPlan;
    /**
     * When a new day's plan does not exist yet, seed it with the unfinished
     * tasks carried from every prior day (each keeping its original creation
     * date). Idempotent: after the first seed the file exists, so a later read
     * never re-runs it. Only writes when there is something to carry.
     */
    private seedCarryover;
    /** Unfinished tasks from every existing plan file dated strictly before `date`. */
    private collectUnfinishedPrior;
    writePlan(plan: StickyPlan): StickyPlan;
    readLog(date: string): StickyLog;
    /** Append an event and persist the log (immutable update). */
    appendEvent(date: string, event: StickyLogEvent): void;
    /** Read a plan for an arbitrary date (for stats), returns raw or empty. */
    readPlanOrEmpty(date: string): StickyPlan;
    readLogOrEmpty(date: string): StickyLog;
    /** Mutations below all write plan + append log atomically-ish. */
    addTask(date: string, text: string, note?: string): StickyPlan;
    deleteTask(date: string, taskId: number): StickyPlan;
    setDone(date: string, taskId: number, done: boolean): StickyPlan;
    editTask(date: string, taskId: number, text: string): StickyPlan;
    setNote(date: string, taskId: number, note?: string): StickyPlan;
    /** The date key (YYYY-MM-DD) for "today". */
    todayKey(): string;
}
/** Resolve the default data dir from the DSH home root. */
export declare function defaultDataDir(): string;
