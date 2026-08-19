/**
 * dsh-daily-sticky host plugin: mounts the `sticky` Typert Remote service
 * (daily sticky note CRUD + stats), backed by a plain-JSON datastore the AI
 * can also read/write directly (the "AI 随时新增" entry). The client half
 * ships in the same package (`./client`); the web server serves it under
 * /plugins/dsh-daily-sticky/client.js.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name (the Loader entry and client bundle id). */
export declare const name = "dsh-daily-sticky";
/** Services required before load: the Typert registry and the tool registry. */
export declare const inject: string[];
/** Host plugin configuration, validated at load by the Loader. */
export interface Config {
    /** Directory that holds plan/ and logs/ (defaults to ~/.dsh/dsh-daily-sticky). */
    dataDir: string;
}
/** Configuration schema: deployment-varying bounds stay tunable from the profile. */
export declare const Config: z<Schemastery.ObjectS<{
    dataDir: z<string, string>;
}>, Schemastery.ObjectT<{
    dataDir: z<string, string>;
}>>;
/**
 * Mount the sticky service, resolving the datastore from config.
 * @param ctx - host cordis context.
 * @param config - validated plugin configuration (schema defaults applied).
 */
export declare function apply(ctx: Context, config?: Config): void;
