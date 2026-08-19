/**
 * dsh-daily-sticky model-facing tools: expose the sticky note to the agent so
 * it can act as a "secretary" — add/list/toggle/stats tasks straight from a
 * conversation ("记一下 X" → sticky_add_task). Registered on `ctx.tools` so
 * every agent sees them. All write to the same plain-JSON plan/logs the
 * browser panel reads, so a change appears in the note live.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Datastore } from './datastore.ts'
import { computeStats } from './stats.ts'
import { scanGapSessions, sessionsRoot } from './scan.ts'

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
      + 'Use it when the user says something like "记一下 / 把这个加进便签 / 今天还要做 / 安排一项" '
      + 'and it is a to-do they want on their note. Returns the added task id and the day\'s total.',
    parameters: {
      text: { type: 'string', required: true, description: 'The task text, a short imperative line (e.g. "论文：黎老师文章 批注").' },
      note: { type: 'string', description: 'Optional 备注 appended to the line (source, deadline, context).' },
      date: { type: 'string', description: 'YYYY-MM-DD date key; defaults to today.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute(args, _exec) {
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

  disposers.push(ctx.tools.register(defineTool({
    name: 'sticky_scan_gaps',
    description:
      '「查漏」：扫描 DSH 近 N 天（默认 2 天）有更新的所有会话，找出最后一条是用户提问、'
      + '还没有 AI 回复的「未决事项」会话。Use when the user asks 查漏 / 看看有什么没处理 / '
      + '这两天有什么悬而未决 / 有没有漏掉的事. Returns a report; offer to add the unresolved '
      + 'items to today\'s sticky note with sticky_add_task.',
    parameters: {
      days: { type: 'integer', description: '扫描窗口天数，默认 2 天。' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute(args, _exec) {
      const sessions = scanGapSessions(sessionsRoot(), args.days ?? 2)
      const unread = sessions.filter(s => s.unread)
      const header = `查漏（近 ${args.days ?? 2} 天）：扫描 ${sessions.length} 个有更新的会话，疑似未决 ${unread.length} 个。`
      if (unread.length === 0) return Promise.resolve(`${header}\n没有发现未决事项。`)
      const lines = unread.map(s =>
        `- [${s.workspaceLabel}]「${s.title || s.sessionId}」（最后活动 ${s.lastActive}）：${s.lastUserText.slice(0, 120)}`,
      )
      return Promise.resolve(`${header}\n${lines.join('\n')}\n（可把其中要做的用 sticky_add_task 加进便签）`)
    },
    presentCall: () => ({ card: 'generic', title: 'Sticky gap scan', kind: 'other', rawInput: {} }),
  })))

  // Register everything; tear down on plugin dispose.
  ctx.effect(() => () => { for (const d of disposers) d() }, 'dsh-daily-sticky: tools')
}
