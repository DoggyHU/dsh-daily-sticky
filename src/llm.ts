/**
 * dsh-daily-sticky LLM helper for the "AI 智能输入" mode: turn a messy user
 * paragraph into concrete sticky-note tasks using the SAME model DSH is
 * currently using. Nothing is hard-coded — the current selection comes from
 * `agentDefaultModel.currentSelection()` (whatever the user picked on the
 * Models page or the deployment default) and the call goes through
 * `ctx.llm.stream`, the exact runtime the agents use.
 */

import type { Context } from '@deepseek-ai/cordis'

/** One task proposed by the AI extraction pass. */
export interface AiExtractTask {
  text: string
  note?: string
}

interface ModelSelectionLike {
  provider?: string
  model?: string
}

interface AgentDefaultModelLike {
  currentSelection?: () => ModelSelectionLike
}

/** Minimal structural shape of stream chunks (text + reasoning + finish). */
interface StreamChunkLike {
  type: string
  text?: string
  index?: number
  reason?: { kind?: string; failure?: { message?: string; code?: string } }
  block?: { type?: string; text?: string }
}

interface ModelInfoLike {
  id: string
  name?: string
}

interface LlmServiceLike {
  stream(opts: {
    provider: string
    model: string
    system?: string
    messages: unknown[]
    maxTokens?: number
    temperature?: number
  }): AsyncIterable<StreamChunkLike>
  listProviders?: () => Array<{ id: string; name: string }>
  listModels?: (provider: string) => Promise<readonly ModelInfoLike[]>
}

const SYSTEM_PROMPT = [
  '你是「每日便签」的任务抽取助手。用户会粘贴一段杂乱的口语、备忘或随手写的文字，',
  '你要从中抽取「用户接下来要自己去完成的事情」作为待办任务。',
  '只抽取真正的待办事项；自言自语、疑问、闲聊、情绪表达、对 AI 的指令都不抽取。',
  '命名遵循「项目：动作」，例如「论文：黎老师文章 批注」；调研类用「调研：主题（产出=…）」。',
  '可以抽多条；每条尽量是一条清晰可执行的动作，不要写成一整段话。',
  '如果原文里有关键背景、截止时间或来源，放进该任务的 note 备注。',
  '输出必须是严格 JSON，不要输出任何其它文字、代码块标记或解释：',
  '{"tasks":[{"text":"任务文本","note":"可选备注"}]}',
  '一条都抽不出时返回 {"tasks":[]}。',
].join('\n')

function extractJsonObject(text: string): { tasks?: unknown } | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1))
    return parsed && typeof parsed === 'object' ? parsed as { tasks?: unknown } : null
  } catch {
    return null
  }
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
export async function extractTasksWithLLM(
  ctx: Context,
  rawText: string,
  override?: { provider: string; model: string },
): Promise<AiExtractTask[]> {
  const llm = ctx.get('llm') as LlmServiceLike | undefined
  if (!llm || typeof llm.stream !== 'function') {
    throw new Error('AI 智能输入需要 DSH 的 LLM 服务，当前未挂载（llm 不可用）')
  }
  let provider: string
  let model: string
  if (override?.provider && override.model) {
    provider = override.provider
    model = override.model
  } else {
    const agentDefaultModel = ctx.get('agentDefaultModel') as AgentDefaultModelLike | undefined
    const selection = agentDefaultModel?.currentSelection?.() ?? {}
    if (!selection.provider || !selection.model) {
      throw new Error('无法确定 DSH 当前使用的模型（agentDefaultModel 无选择）')
    }
    provider = selection.provider
    model = selection.model
  }

  const stream = llm.stream({
    provider,
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: rawText }] }],
    maxTokens: 2048,
    temperature: 0.2,
  })

  // Assemble visible text. `text-delta`s arrive as they stream; `block-end`
  // carries the authoritative full text (some adapters buffer it); a reasoning
  // model may answer inside `reasoning-delta`s with an empty text block, so
  // reasoning becomes a fallback when no visible text came back.
  const textParts = new Map<number, string>()
  const order: number[] = []
  let reasoning = ''
  let finishKind: string | null = null
  let finishFailure: string | null = null

  for await (const chunk of stream) {
    if (chunk.type === 'finish') {
      finishKind = chunk.reason?.kind ?? null
      finishFailure = chunk.reason?.failure?.message ?? null
      continue
    }
    const idx = chunk.index ?? 0
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      if (!textParts.has(idx)) order.push(idx)
      textParts.set(idx, (textParts.get(idx) ?? '') + chunk.text)
    } else if (chunk.type === 'block-end' && chunk.block?.type === 'text' && typeof chunk.block.text === 'string') {
      const full = chunk.block.text
      if (!textParts.has(idx)) order.push(idx)
      // Keep the longer of streamed deltas vs the authoritative block text.
      if (full.length >= (textParts.get(idx) ?? '').length) textParts.set(idx, full)
    } else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
      reasoning += chunk.text
    }
  }

  let out = order.map(i => textParts.get(i) ?? '').join('').trim()
  if (!out && reasoning.trim()) out = reasoning.trim()

  const parsed = extractJsonObject(out)
  if (!parsed || !Array.isArray(parsed.tasks)) {
    if (finishKind === 'error' || finishKind === 'aborted') {
      throw new Error(`AI 模型调用失败（${finishKind}）${finishFailure ? `：${finishFailure}` : '，请稍后重试'}`)
    }
    const shown = out ? out.slice(0, 160) : (finishKind ? `（模型已结束，状态 ${finishKind}，无文本输出）` : '（模型没有返回文本）')
    throw new Error(`AI 抽取结果无法解析，请重试。模型输出：${shown}`)
  }
  return parsed.tasks
    .filter((t): t is { text: string; note?: string } => {
      if (!t || typeof t !== 'object') return false
      const rec = t as { text?: unknown; note?: unknown }
      return typeof rec.text === 'string' && rec.text.trim().length > 0
    })
    .map(t => {
      const text = t.text.trim().slice(0, 2000)
      const note = typeof t.note === 'string' && t.note.trim() ? t.note.trim().slice(0, 2000) : undefined
      return note ? { text, note } : { text }
    })
}

/**
 * Enumerate the models DSH can currently use — the same source the Models
 * page reads (registered provider routes + each adapter's advertised models) —
 * so the sticky note can offer a "跟随当前模型 or pick one" selector.
 */
export async function listModelChoices(ctx: Context): Promise<{
  current: { provider: string; model: string } | null
  options: Array<{ provider: string; model: string; display_name: string }>
}> {
  const agentDefaultModel = ctx.get('agentDefaultModel') as AgentDefaultModelLike | undefined
  const selection = agentDefaultModel?.currentSelection?.() ?? {}
  const current = selection.provider && selection.model
    ? { provider: selection.provider, model: selection.model }
    : null

  const options: Array<{ provider: string; model: string; display_name: string }> = []
  const seen = new Set<string>()
  const llm = ctx.get('llm') as LlmServiceLike | undefined
  if (llm && typeof llm.listProviders === 'function' && typeof llm.listModels === 'function') {
    for (const provider of llm.listProviders() ?? []) {
      try {
        const models = (await llm.listModels(provider.id)) ?? []
        for (const m of models) {
          if (!m.id) continue
          const key = `${provider.id}/${m.id}`
          if (seen.has(key)) continue
          seen.add(key)
          options.push({
            provider: provider.id,
            model: m.id,
            display_name: `${provider.name} · ${m.name || m.id}`,
          })
        }
      } catch {
        // a provider that cannot list models simply contributes none
      }
    }
  }
  return { current, options }
}

/** A short label for the model DSH is currently using (for display only). */
export function currentModelLabel(ctx: Context): string {
  const agentDefaultModel = ctx.get('agentDefaultModel') as AgentDefaultModelLike | undefined
  const selection = agentDefaultModel?.currentSelection?.() ?? {}
  return selection.provider && selection.model ? `${selection.provider}/${selection.model}` : ''
}
