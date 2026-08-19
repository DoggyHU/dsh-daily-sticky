/**
 * dsh-daily-sticky host plugin: mounts the `sticky` Typert Remote service
 * (daily sticky note CRUD + stats), backed by a plain-JSON datastore the AI
 * can also read/write directly (the "AI 随时新增" entry). The client half
 * ships in the same package (`./client`); the web server serves it under
 * /plugins/dsh-daily-sticky/client.js.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: brings the `ctx.typert` Context merge into this program.
import type {} from '@deepseek-ai/dsh-typert-registry'
import { Datastore, defaultDataDir } from './datastore.ts'
import { StickyRuntime } from './runtime.ts'
import { STICKY_MANIFEST } from './typert.ts'
import { registerStickyTools } from './tools.ts'

/** Cordis plugin name (the Loader entry and client bundle id). */
export const name = 'dsh-daily-sticky'

/** Services required before load: the Typert registry and the tool registry. */
export const inject = ['typert', 'tools']

/** Host plugin configuration, validated at load by the Loader. */
export interface Config {
  /** Directory that holds plan/ and logs/ (defaults to ~/.dsh/dsh-daily-sticky). */
  dataDir: string
}

/** Configuration schema: deployment-varying bounds stay tunable from the profile. */
export const Config = z.object({
  dataDir: z.string().default(defaultDataDir()),
})

/**
 * Mount the sticky service, resolving the datastore from config.
 * @param ctx - host cordis context.
 * @param config - validated plugin configuration (schema defaults applied).
 */
export function apply(ctx: Context, config?: Config): void {
  const resolved: Config = Config(config ?? {})
  const ds = new Datastore(resolved.dataDir)
  new StickyRuntime(ctx, ds)
  registerStickyTools(ctx, ds)

  // Strict endpoint registration: the gateway resolves sticky/* from this
  // manifest, independent of decorator marker state.
  ctx.effect(() => {
    const dispose = ctx.typert.register(STICKY_MANIFEST)
    return () => { void dispose() }
  }, 'dsh-daily-sticky: typert manifest')
}
