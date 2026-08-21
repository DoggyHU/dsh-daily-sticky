/**
 * The callable face of the mounted `sticky` Remote namespace, as the client
 * resolves it through `ctx.reflect.get('remote.sticky')`. Mirrors the typed
 * namespace declared in remote.ts but kept independent so the component does
 * not need the runtime Reader identity.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
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
} from '../contract.ts'

export interface StickyNamespaceFace {
  readPlan: (date: string) => Promise<RemoteResult<StickyPlan>>
  addTask: (input: AddTaskInput) => Promise<RemoteResult<StickyPlan>>
  deleteTask: (input: DeleteTaskInput) => Promise<RemoteResult<StickyPlan>>
  setDone: (input: SetDoneInput) => Promise<RemoteResult<StickyPlan>>
  editTask: (input: EditTaskInput) => Promise<RemoteResult<StickyPlan>>
  setNote: (input: SetNoteInput) => Promise<RemoteResult<StickyPlan>>
  moveToBacklog: (input: MoveToBacklogInput) => Promise<RemoteResult<StickyPlan>>
  listBacklog: () => Promise<RemoteResult<StickyBacklog>>
  extractFromBacklog: (input: ExtractFromBacklogInput) => Promise<RemoteResult<StickyPlan>>
  deleteFromBacklog: (backlog_id: number) => Promise<RemoteResult<StickyBacklog>>
  stats: (input: StatsInput) => Promise<RemoteResult<StickyStats>>
  aiExtract: (input: AiExtractInput) => Promise<RemoteResult<AiExtractResult>>
  listModels: () => Promise<RemoteResult<ModelListResult>>
}
