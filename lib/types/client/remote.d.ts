/**
 * The client-side Typert Remote contribution for the dsh-daily-sticky host
 * service: mounts the shared strict descriptors into `ctx.remote.sticky`.
 * The descriptors and codecs come from the shared contract module, so the
 * browser bundle and the host manifest stay on one wire definition.
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { StickyPlan, StickyStats, AddTaskInput, EditTaskInput, SetDoneInput, SetNoteInput, DeleteTaskInput, StatsInput, AiExtractInput, AiExtractResult, ModelListResult } from '../contract.ts';
export type { StickyPlan, StickyStats, StickyTask, StickyPeriodStat, AddTaskInput, EditTaskInput, SetDoneInput, SetNoteInput, DeleteTaskInput, StatsInput, AiExtractInput, AiExtractTask, AiExtractResult, ModelChoice, ModelListResult, } from '../contract.ts';
/** The sticky Remote namespace's client contribution. */
export declare const STICKY_REMOTE: TypertRemoteContribution;
declare module '@deepseek-ai/dsh-typert-protocol' {
    /** The `sticky` namespace face mounted under `ctx.remote.sticky`. */
    interface TypertRemoteNamespace$dshDailySticky {
        readPlan: (date: string) => Promise<RemoteResult<StickyPlan>>;
        addTask: (input: AddTaskInput) => Promise<RemoteResult<StickyPlan>>;
        deleteTask: (input: DeleteTaskInput) => Promise<RemoteResult<StickyPlan>>;
        setDone: (input: SetDoneInput) => Promise<RemoteResult<StickyPlan>>;
        editTask: (input: EditTaskInput) => Promise<RemoteResult<StickyPlan>>;
        setNote: (input: SetNoteInput) => Promise<RemoteResult<StickyPlan>>;
        stats: (input: StatsInput) => Promise<RemoteResult<StickyStats>>;
        aiExtract: (input: AiExtractInput) => Promise<RemoteResult<AiExtractResult>>;
        listModels: () => Promise<RemoteResult<ModelListResult>>;
    }
    interface TypertRemoteMap {
        'sticky/readPlan': (date: string) => Promise<RemoteResult<StickyPlan>>;
        'sticky/addTask': (input: AddTaskInput) => Promise<RemoteResult<StickyPlan>>;
        'sticky/deleteTask': (input: DeleteTaskInput) => Promise<RemoteResult<StickyPlan>>;
        'sticky/setDone': (input: SetDoneInput) => Promise<RemoteResult<StickyPlan>>;
        'sticky/editTask': (input: EditTaskInput) => Promise<RemoteResult<StickyPlan>>;
        'sticky/setNote': (input: SetNoteInput) => Promise<RemoteResult<StickyPlan>>;
        'sticky/stats': (input: StatsInput) => Promise<RemoteResult<StickyStats>>;
        'sticky/aiExtract': (input: AiExtractInput) => Promise<RemoteResult<AiExtractResult>>;
        'sticky/listModels': () => Promise<RemoteResult<ModelListResult>>;
    }
    interface TypertRemoteNamespaceMap {
        sticky: TypertRemoteNamespace$dshDailySticky;
    }
}
