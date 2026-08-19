/**
 * The callable face of the mounted `sticky` Remote namespace, as the client
 * resolves it through `ctx.reflect.get('remote.sticky')`. Mirrors the typed
 * namespace declared in remote.ts but kept independent so the component does
 * not need the runtime Reader identity.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { StickyPlan, StickyStats, AddTaskInput, EditTaskInput, SetDoneInput, SetNoteInput, DeleteTaskInput, StatsInput, AiExtractInput, AiExtractResult, ModelListResult, GapScanInput, GapScanResult, TagGapsInput } from '../contract.ts';
export interface StickyNamespaceFace {
    readPlan: (date: string) => Promise<RemoteResult<StickyPlan>>;
    addTask: (input: AddTaskInput) => Promise<RemoteResult<StickyPlan>>;
    deleteTask: (input: DeleteTaskInput) => Promise<RemoteResult<StickyPlan>>;
    setDone: (input: SetDoneInput) => Promise<RemoteResult<StickyPlan>>;
    editTask: (input: EditTaskInput) => Promise<RemoteResult<StickyPlan>>;
    setNote: (input: SetNoteInput) => Promise<RemoteResult<StickyPlan>>;
    stats: (input: StatsInput) => Promise<RemoteResult<StickyStats>>;
    aiExtract: (input: AiExtractInput) => Promise<RemoteResult<AiExtractResult>>;
    scanGaps: (input: GapScanInput) => Promise<RemoteResult<GapScanResult>>;
    tagGaps: (input: TagGapsInput) => Promise<RemoteResult<GapScanResult>>;
    listModels: () => Promise<RemoteResult<ModelListResult>>;
}
