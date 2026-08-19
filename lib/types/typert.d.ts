/**
 * The hand-written host Typert manifest for the sticky Remote. Registered
 * through `ctx.typert.register` in the plugin body, it claims the wire
 * endpoints through the strict registry so the Host Gateway resolves
 * sticky/* without consulting the `@Remote` marker table.
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types';
/** The sticky namespace's host manifest (strict codecs shared with the client). */
export declare const STICKY_MANIFEST: TypertContribution;
