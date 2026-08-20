/**
 * dsh-daily-sticky model-facing tools: expose the sticky note to the agent so
 * it can act as a "secretary" — add/list/toggle/stats tasks straight from a
 * conversation ("记一下 X" → sticky_add_task). Registered on `ctx.tools` so
 * every agent sees them. All write to the same plain-JSON plan/logs the
 * browser panel reads, so a change appears in the note live.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
// Brings the `ctx.userQuestions` Context augmentation (human confirm seam).
import type {} from '@deepseek-ai/dsh-user-questions'
import type { Datastore } from './datastore.ts'
import { computeStats } from './stats.ts'

function todayKey(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function tick(ok: boolean): string {
  return ok ? '✔' : '✘'
}

/**
 * Register the four sticky tools on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry.
 * @param ds - the shared datastore.
 */
export function registerStickyTools(ctx: Context, ds: Datastore): void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'sticky_add_task',
    description:
      'Add one line to the user\'s daily sticky note (today by default). '
      + 'Use it ONLY when the user explicitly asks you to remember a task THEY personally need to do '
      + '(phrases like "记一下 / 把这个加进便签 / 今天还要做 / 安排一项 / 别忘了…"). '
      + 'Before writing, the user is asked to confirm at the confirmation prompt; only a human "确认写入" lets it land. '
      + 'NEVER record: your own reasoning, your self-assigned next steps, your investigation/research conclusions, '
      + 'verification findings, debugging notes, model capability notes, or anything you decided for yourself. '
      + 'If the user did not ask you to save a personal to-do, DO NOT call this tool at all. '
      + 'Examples of VALID use: user says "记一下明天下午3点给老张回电话" → record that. '
      + 'Examples of INVALID use: you conclude "rc8 不支持 read_image" and try to save that conclusion as a task — do NOT, '
      + 'that is your own working note and is not a human to-do.',
    parameters: {
      text: { type: 'string', required: true, description: 'The task text, a short imperative line (e.g. "论文：黎老师文章 批注").' },
      note: { type: 'string', description: 'Optional 备注 appended to the line (source, deadline, context).' },
      date: { type: 'string', description: 'YYYY-MM-DD date key; defaults to today.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args, exec) {
      // Human-confirm the write before it lands: the sticky note is the USER's
      // to-do list, so a model-initiated add must be ratified by a human.
      // This stops the model from silently recording its own reasoning /
      // next-step instructions as if they were the user's tasks.
      let ok = false
      try {
        const answer = await ctx.userQuestions.ask({
          questions: [{
            id: 'confirm-add',
            header: '写入今日便签',
            question: `确认把这行加入今日便签？`,
            detail: args.text + (args.note ? `\n\n备注：${args.note}` : ''),
            options: [
              { label: '确认写入', description: '这是一条人类自己要办的待办，写入便签。' },
              { label: '不写入', description: '不要写入，取消本次添加。' },
            ],
            intent: { kind: 'plan-review', approve: '确认写入' },
          }],
          ...exec.agent !== undefined ? { agent: exec.agent } : {},
          signal: exec.signal,
        })
        ok = answer.answers.some(a => a.id === 'confirm-add' && a.selected.includes('确认写入'))
      } catch {
        // No confirmation channel (no provider, or not a live root agent, or
        // cancelled). Fail closed: do NOT write — the user can add it straight
        // in the note panel instead.
        ok = false
      }
      if (!ok) {
        return Promise.resolve('未写入（未获确认）。如确需记录，请让用户在便签面板直接添加，或再次明确要求记录。')
      }
      const plan = ds.addTask(args.date ?? todayKey(), args.text, args.note)
      const added = plan.tasks[plan.tasks.length - 1]
      return Promise.resolve(
        `${tick(added !== undefined)} added task #${added?.task_id}: "${args.text}"${added?.done === false ? ` — today ${plan.tasks.length} task(s)` : ''}`,
      )
    },
    presentCall: args => ({ card: 'generic', title: 'Add to daily sticky', kind: 'other', rawInput: { text: args.text } }),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'sticky_list_tasks',
    description:
      'List the user\'s daily sticky note tasks for a date (today by default): each with its id, '
      + 'done state, text, and optional note, plus a 完成/总数 count. Use when the user asks to see '
      + 'their tasks / what they planned / the daily note.',
    parameters: {
      date: { type: 'string', description: 'YYYY-MM-DD date key; defaults to today.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute(args, _exec) {
      const plan = ds.readPlan(args.date ?? todayKey())
      const done = plan.tasks.filter(t => t.done).length
      const lines = plan.tasks.map(t =>
        `${tick(t.done)} [#${t.task_id}] ${t.text}${t.note ? ` （备注：${t.note}）` : ''}`,
      ).join('\n') || '（今天还没有任务。）'
      return Promise.resolve(`今日便签 ${plan.tasks.length} 条（完成 ${done}/${plan.tasks.length}）：\n${lines}`)
    },
    presentCall: () => ({ card: 'generic', title: 'List daily sticky', kind: 'other', rawInput: {} }),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'sticky_set_done',
    description:
      'Mark a sticky-task as done (checked, struck through) or undo it. Use when the user says "做完了 / '
      + '搞定 / 这项完成了" or wants to re-open a task. Takes the task id from sticky_list_tasks.',
    parameters: {
      task_id: { type: 'integer', required: true, description: 'The task id (from sticky_list_tasks).' },
      done: { type: 'boolean', required: true, description: 'true = mark done, false = undo.' },
      date: { type: 'string', description: 'YYYY-MM-DD date key; defaults to today.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute(args, _exec) {
      const plan = ds.setDone(args.date ?? todayKey(), args.task_id, args.done)
      const t = plan.tasks.find(x => x.task_id === args.task_id)
      if (!t) return Promise.resolve(`${tick(false)} task #${args.task_id} not found`)
      return Promise.resolve(`${tick(true)} marked "${t.text}" as ${args.done ? '完成' : '未完成'}`)
    },
    presentCall: args => ({ card: 'generic', title: args.done ? 'Mark done' : 'Undo done', kind: 'other', rawInput: { task_id: args.task_id } }),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'sticky_stats',
    description:
      'Show the weekly and monthly counts for the daily sticky note (录入条数, 完成条数, 完成率) '
      + 'with 周环比 / 月环比 deltas. Use when the user asks 我这周做了多少 / 统计 / 环比 / 完成率.',
    parameters: {
      date: { type: 'string', description: 'YYYY-MM-DD reference date; defaults to today.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute(args, _exec) {
      const s = computeStats(ds, args.date ?? todayKey())
      const pct = (n: number) => `${Math.round(n * 1000) / 10}%`
      const d = (n: number) => n === 0 ? '0' : (n > 0 ? `+${n}` : `${n}`)
      const dp = (n: number) => n === 0 ? '0%' : (n > 0 ? `+${Math.round(n * 10) / 10}%` : `${Math.round(n * 10) / 10}%`)
      return Promise.resolve(
        `本周：录入 ${s.week.added}、完成 ${s.week.done}、完成率 ${pct(s.week.rate)}；较上周完成 ${d(s.weekDoneDelta)}、完成率 ${dp(s.weekRateDeltaPct)}\n`
        + `本月：录入 ${s.month.added}、完成 ${s.month.done}、完成率 ${pct(s.month.rate)}；较上月完成 ${d(s.monthDoneDelta)}、完成率 ${dp(s.monthRateDeltaPct)}`,
      )
    },
    presentCall: () => ({ card: 'generic', title: 'Sticky stats', kind: 'other', rawInput: {} }),
  })))

  // Register everything; tear down on plugin dispose.
  ctx.effect(() => () => { for (const d of disposers) d() }, 'dsh-daily-sticky: tools')
}
