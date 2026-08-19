/**
 * The hand-written host Typert manifest for the sticky Remote. Registered
 * through `ctx.typert.register` in the plugin body, it claims the wire
 * endpoints through the strict registry so the Host Gateway resolves
 * sticky/* without consulting the `@Remote` marker table.
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { STICKY_INVOCATIONS } from './contract.ts'

/** The sticky namespace's host manifest (strict codecs shared with the client). */
export const STICKY_MANIFEST: TypertContribution = {
  package: 'dsh-daily-sticky',
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: 'sticky',
        exportName: 'StickyRuntime',
        description: 'Daily sticky note: plan CRUD, per-day event log, weekly/monthly stats.',
        tags: [],
        members: [
          { kind: 'method', name: 'readPlan', signature: 'readPlan(date: string): StickyPlan' },
          { kind: 'method', name: 'addTask', signature: 'addTask(date: string, text: string, note?: string): StickyPlan' },
          { kind: 'method', name: 'deleteTask', signature: 'deleteTask(date: string, taskId: number): StickyPlan' },
          { kind: 'method', name: 'setDone', signature: 'setDone(date: string, taskId: number, done: boolean): StickyPlan' },
          { kind: 'method', name: 'editTask', signature: 'editTask(date: string, taskId: number, text: string): StickyPlan' },
          { kind: 'method', name: 'setNote', signature: 'setNote(date: string, taskId: number, note?: string): StickyPlan' },
          { kind: 'method', name: 'stats', signature: 'stats(input: StatsInput): StickyStats' },
          { kind: 'method', name: 'aiExtract', signature: 'aiExtract(input: AiExtractInput): Promise<AiExtractResult>' },
          { kind: 'method', name: 'scanGaps', signature: 'scanGaps(input: GapScanInput): GapScanResult' },
          { kind: 'method', name: 'tagGaps', signature: 'tagGaps(input: TagGapsInput): GapScanResult' },
          { kind: 'method', name: 'listModels', signature: 'listModels(): ModelListResult' },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: STICKY_INVOCATIONS,
}
