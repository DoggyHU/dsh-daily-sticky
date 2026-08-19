/**
 * dsh-daily-sticky client plugin: the browser half of the daily sticky note.
 * Mounts the `sticky` Remote namespace (host CRUD + stats), resolves its
 * callable face, then renders the floating StickyPanel through a body portal
 * (the web shell has no top-right slot; dsh-agent-teams uses the same pattern
 * for its activity floater). The panel polls the host so AI writes to the
 * shared JSON files appear live.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createRoot, type Root } from 'react-dom/client'
// Type-only: brings the `ctx.remote` merge into this program.
import type {} from '@deepseek-ai/dsh-typert-protocol'
import { STICKY_REMOTE } from './remote.ts'
import type { StickyNamespaceFace } from './types.ts'
import { StickyPanel } from './StickyPanel.tsx'

/** Required services: the Remote mount face. */
export const inject = ['remote']

/**
 * Mount the sticky nanote: register the Remote, resolve the namespace face,
 * then render the floating panel body-portal.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const host = document.createElement('div')
  host.dataset.dshDailyStickyHost = ''
  document.body.appendChild(host)

  let root: Root | undefined

  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(STICKY_REMOTE)
    const sticky = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.sticky') as StickyNamespaceFace | undefined
    if (sticky === undefined) {
      throw new Error('dsh-daily-sticky: the sticky Remote namespace did not mount')
    }
    root = createRoot(host)
    root.render(<StickyPanel sticky={sticky} />)
    return () => {
      root?.unmount()
      root = undefined
      void dispose()
    }
  }, 'dsh-daily-sticky: remote + panel')
}
