/**
 * dsh-daily-sticky model-facing tools: expose the sticky note to the agent so
 * it can act as a "secretary" — add/list/toggle/stats tasks straight from a
 * conversation ("记一下 X" → sticky_add_task). Registered on `ctx.tools` so
 * every agent sees them. All write to the same plain-JSON plan/logs the
 * browser panel reads, so a change appears in the note live.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Datastore } from './datastore.ts';
/**
 * Register the four sticky tools on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry.
 * @param ds - the shared datastore.
 */
export declare function registerStickyTools(ctx: Context, ds: Datastore): void;
