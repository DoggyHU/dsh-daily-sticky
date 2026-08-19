/**
 * dsh-daily-sticky LLM helper for the "AI 智能输入" mode: turn a messy user
 * paragraph into concrete sticky-note tasks using the SAME model DSH is
 * currently using. Nothing is hard-coded — the current selection comes from
 * `agentDefaultModel.currentSelection()` (whatever the user picked on the
 * Models page or the deployment default) and the call goes through
 * `ctx.llm.stream`, the exact runtime the agents use.
 */
import type { Context } from '@deepseek-ai/cordis';
/** One task proposed by the AI extraction pass. */
export interface AiExtractTask {
    text: string;
    note?: string;
}
/**
 * Extract candidate sticky tasks from a messy paragraph using DSH's current
 * model (or an explicit override).
 * @param ctx - the host cordis context (for `llm` + `agentDefaultModel`).
 * @param rawText - whatever the user pasted/said (voice transcript, notes…).
 * @param override - optional explicit provider/model chosen in the sticky UI;
 *   omitted means "follow DSH's current model".
 * @returns a list of proposed task lines.
 * @throws a human-readable message when the LLM seam is unavailable or the
 *   model output cannot be parsed.
 */
export declare function extractTasksWithLLM(ctx: Context, rawText: string, override?: {
    provider: string;
    model: string;
}): Promise<AiExtractTask[]>;
/**
 * Enumerate the models DSH can currently use — the same source the Models
 * page reads (registered provider routes + each adapter's advertised models) —
 * so the sticky note can offer a "跟随当前模型 or pick one" selector.
 */
export declare function listModelChoices(ctx: Context): Promise<{
    current: {
        provider: string;
        model: string;
    } | null;
    options: Array<{
        provider: string;
        model: string;
        display_name: string;
    }>;
}>;
/** A short label for the model DSH is currently using (for display only). */
export declare function currentModelLabel(ctx: Context): string;
