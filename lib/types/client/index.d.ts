/**
 * dsh-daily-sticky client plugin: the browser half of the daily sticky note.
 * Mounts the `sticky` Remote namespace (host CRUD + stats), resolves its
 * callable face, then renders the floating StickyPanel through a body portal
 * (the web shell has no top-right slot; dsh-agent-teams uses the same pattern
 * for its activity floater). The panel polls the host so AI writes to the
 * shared JSON files appear live.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Required services: the Remote mount face. */
export declare const inject: string[];
/**
 * Mount the sticky nanote: register the Remote, resolve the namespace face,
 * then render the floating panel body-portal.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
