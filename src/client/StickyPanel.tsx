/**
 * StickyPanel: the daily-sticky note for DSH.
 *
 * By default only a small summon button is shown (tucked); clicking it opens
 * the floating note. The note follows the DSH system theme through the
 * `--dsw-alias-*` token variables (light/dark switch automatically), and uses
 * no emoji — typographic, DSH-style controls throughout. Draggable header,
 * collapsible body, task lines with check/note/edit/delete, a two-mode input
 * (manual add + AI 智能输入 that turns a messy paragraph into tasks using the
 * model DSH is currently using), a 查漏 button that scans the last 2 days of
 * DSH sessions for unresolved conversations, and a stats popup (week/month +
 * WoW/MoM deltas). Data flows through the `sticky` Remote namespace.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  StickyPlan,
  StickyTask,
  StickyStats,
  AiExtractTask,
  ModelChoice,
  GapScanResult,
} from '../contract.ts'
import type { StickyNamespaceFace } from './types.ts'

// --- theme tokens (DSH design system; switch on body[data-ds-dark-theme]) ---
const T = {
  surface: 'var(--dsw-alias-bg-layer-1)',
  surface2: 'var(--dsw-alias-bg-layer-2)',
  overlay: 'var(--dsw-alias-bg-overlay)',
  border: 'var(--dsw-alias-border-l2)',
  borderSoft: 'var(--dsw-alias-border-l1)',
  text: 'var(--dsw-alias-label-primary)',
  textDim: 'var(--dsw-alias-label-secondary)',
  textFaint: 'var(--dsw-alias-label-tertiary)',
  accent: 'var(--dsw-alias-state-business-primary)',
  success: 'var(--dsw-alias-state-success-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  brand: 'var(--dsw-alias-brand-primary)',
}

// --- helpers ---

function todayKey(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Whole days from `from` to `to` (YYYY-MM-DD), to - from. */
function diffDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

/** Gray subscript for a task carried over from earlier days: 昨天/前天/3天前. */
function ageOf(task: { origin_date?: string; date: string }, ref: string): string {
  const origin = task.origin_date ?? task.date
  const days = diffDays(origin, ref)
  if (days <= 0) return ''
  if (days === 1) return '昨天'
  if (days === 2) return '前天'
  return '3天前'
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`
}

function deltaPct(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${Math.round(n * 10) / 10}%`
}

function deltaCount(n: number): string {
  if (n === 0) return '0'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n}`
}

// --- summon button ---

const summonStyle: CSSProperties = {
  position: 'fixed',
  right: 14,
  bottom: 14,
  zIndex: 2147483000,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  background: T.surface2,
  color: T.text,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  fontSize: 13,
  cursor: 'pointer',
  boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
  userSelect: 'none',
}

function SummonButton({ count, onOpen }: { count: string; onOpen: () => void }) {
  return (
    <button style={summonStyle} onClick={onOpen} title="打开今日便签">
      <span
        style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent, display: 'inline-block' }}
      />
      <span>便签</span>
      {count !== '' && <span style={{ color: T.textDim, fontWeight: 500 }}>{count}</span>}
    </button>
  )
}

// --- panel chrome ---

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 80,
  right: 24,
  zIndex: 2147483000,
  width: 340,
  maxHeight: '74vh',
  display: 'flex',
  flexDirection: 'column',
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 10,
  boxShadow: '0 10px 32px rgba(0,0,0,0.28)',
  color: T.text,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  fontSize: 13,
  overflow: 'hidden',
  userSelect: 'none',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 10px',
  cursor: 'grab',
  background: T.surface2,
  borderBottom: `1px solid ${T.borderSoft}`,
  flexShrink: 0,
}

const titleStyle: CSSProperties = {
  flex: 1,
  fontWeight: 600,
  fontSize: 13,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: T.text,
}

const iconBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: T.textDim,
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
  padding: '4px 6px',
  borderRadius: 5,
}

const bodyStyle: CSSProperties = {
  overflowY: 'auto',
  padding: '6px 8px',
  flex: 1,
  minHeight: 60,
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const addRowStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '6px 8px',
  borderTop: `1px solid ${T.borderSoft}`,
  flexShrink: 0,
}

const inputStyle: CSSProperties = {
  flex: 1,
  background: T.surface2,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  color: T.text,
  padding: '4px 8px',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

// --- stats popup ---

function StatLine({ label, stat, delta, deltaRate, suffix }: {
  label: string
  stat: { added: number; done: number; rate: number }
  delta: number
  deltaRate: number
  suffix: string
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 600, color: T.text }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: T.textDim, marginTop: 2 }}>
        <span>录入 {stat.added} · 完成 {stat.done} · 完成率 {pct(stat.rate)}</span>
      </div>
      <div style={{ color: T.success, fontSize: 12, marginTop: 2 }}>
        {suffix}完成 {deltaCount(delta)} · 完成率 {deltaPct(deltaRate)}
      </div>
    </div>
  )
}

function StatsSection({ stats, onClose }: { stats: StickyStats; onClose: () => void }) {
  const box: CSSProperties = {
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    background: T.surface2,
    padding: 10,
    marginBottom: 8,
  }
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <b style={{ fontSize: 12 }}>统计（周/月环比）</b>
        <button style={iconBtn} onClick={onClose} title="关闭">✕</button>
      </div>
      <StatLine label="本周" stat={stats.week} delta={stats.weekDoneDelta} deltaRate={stats.weekRateDeltaPct} suffix="较上周" />
      <StatLine label="本月" stat={stats.month} delta={stats.monthDoneDelta} deltaRate={stats.monthRateDeltaPct} suffix="较上月" />
      <div style={{ color: T.textFaint, fontSize: 12, marginTop: 4 }}>本月 = 月初至今 vs 上月同期</div>
    </div>
  )
}

// --- gap (查漏) inline section ---

function GapSection({ result, drafts, checked, expanded, adding, error, showFresh, onDraft, onToggle, onExpand, onIgnore, onClose, onAdd, onToggleFresh }: {
  result: GapScanResult
  drafts: Record<string, string>
  checked: Record<string, boolean>
  expanded: Record<string, boolean>
  adding: boolean
  error: string | null
  showFresh: boolean
  onDraft: (id: string, text: string) => void
  onToggle: (id: string) => void
  onExpand: (id: string) => void
  onIgnore: (id: string) => void
  onClose: () => void
  onAdd: () => void
  onToggleFresh: () => void
}) {
  const box: CSSProperties = {
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    background: T.surface2,
    padding: '8px 10px',
    marginBottom: 8,
  }
  const actionable = result.sessions.filter(s => s.status !== 'read' && (s.status !== 'fresh' || showFresh))
  const pickedCount = actionable.filter(s => checked[s.session_id]).length
  const nUnread = result.sessions.filter(s => s.status === 'unread').length
  const nAwaiting = result.sessions.filter(s => s.status === 'awaiting').length
  const nFresh = result.sessions.filter(s => s.status === 'fresh').length

  const statusBadge = (s: { status: string }): { text: string; color: string } => {
    if (s.status === 'unread') return { text: '你问没答', color: T.danger }
    if (s.status === 'awaiting') return { text: '模型在等你', color: T.accent }
    if (s.status === 'fresh') return { text: '刚完成', color: T.textDim }
    return { text: '', color: T.textFaint }
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: 12 }}>查漏（近 {result.window_days} 天）</b>
        <button style={iconBtn} onClick={onClose} title="关闭">✕</button>
      </div>
      <div style={{ color: T.textDim, fontSize: 11, marginTop: 2, marginBottom: 6 }}>
        扫描 {result.scanned} 个有更新的会话{result.excluded > 0 ? `，已处理 ${result.excluded} 个` : ''}。
        待处理：你问没答 {nUnread} · 模型在等你 {nAwaiting} · 刚完成 {nFresh}
        {nFresh > 0 && (
          <button
            style={{ ...iconBtn, fontSize: 11, color: T.accent, padding: '0 2px' }}
            onClick={onToggleFresh}
            title={showFresh ? '收起刚完成项' : '展开刚完成项（可能很多，默认隐藏）'}
          >
            {showFresh ? '收起' : '展开'}
          </button>
        )}
        。补录或忽略后，下次查漏不再出现。
      </div>
      {error && <div style={{ color: T.danger, fontSize: 12, marginBottom: 6 }}>{error}</div>}
      {actionable.length === 0 && (
        <div style={{ color: T.textFaint, fontSize: 12, padding: '4px 0' }}>
          近 {result.window_days} 天没有发现待处理事项，都很干净。
        </div>
      )}
      {actionable.map(s => {
        const badge = statusBadge(s)
        return (
        <div key={s.session_id} style={{ padding: '6px 0', borderBottom: `1px solid ${T.borderSoft}` }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              style={{ marginTop: 3, accentColor: T.accent }}
              checked={Boolean(checked[s.session_id])}
              onChange={() => onToggle(s.session_id)}
            />
            <div style={{ flex: 1 }}>
              <div style={{ color: T.textDim, fontSize: 11, marginBottom: 2, wordBreak: 'break-word' }}>
                <span style={{ color: badge.color, marginRight: 4 }}>[{badge.text}]</span>
                [{s.workspace_label}] 「{s.title || s.session_id}」 · 最后活动 {s.last_active}
              </div>
              <input
                style={{ ...inputStyle, fontSize: 12 }}
                value={drafts[s.session_id] ?? s.last_user_text}
                placeholder="（无文字内容，可手写要补录的事）"
                onChange={e => onDraft(s.session_id, e.target.value)}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {s.excerpt.length > 0 && (
                  <button
                    style={{ ...iconBtn, fontSize: 11, color: T.textFaint, padding: '2px 0' }}
                    onClick={() => onExpand(s.session_id)}
                  >
                    {expanded[s.session_id] ? '收起详情 ▲' : '对话尾巴详情 ▼'}
                  </button>
                )}
                <button
                  style={{ ...iconBtn, fontSize: 11, color: T.textFaint, padding: '2px 0' }}
                  title="忽略这条：打上 Tag，以后查漏不再出现"
                  onClick={() => onIgnore(s.session_id)}
                >
                  忽略
                </button>
              </div>
              {expanded[s.session_id] && (
                <div style={{ color: T.textFaint, fontSize: 11, whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                  {s.excerpt.join('\n\n')}
                </div>
              )}
            </div>
          </div>
        </div>
        )
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ color: T.textFaint, fontSize: 12 }}>勾选 {pickedCount} 项</span>
        <button
          style={{
            ...iconBtn,
            color: pickedCount > 0 ? T.accent : T.textFaint,
            background: 'var(--dsw-alias-state-business-primary-subtle, rgba(0,0,0,0.06))',
            padding: '5px 12px',
          }}
          disabled={pickedCount === 0 || adding}
          onClick={onAdd}
        >
          {adding ? '补录中…' : `补录 ${pickedCount} 条到今日便签`}
        </button>
      </div>
    </div>
  )
}

// --- task row ---

function TaskRow({ task, ageLabel, onToggle, onEdit, onDelete, onNote }: {
  task: StickyTask
  ageLabel?: string
  onToggle: (t: StickyTask) => void
  onEdit: (t: StickyTask, text: string) => void
  onDelete: (t: StickyTask) => void
  onNote: (t: StickyTask, note: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.text)
  const [noteEditing, setNoteEditing] = useState(false)
  const [noteDraft, setNoteDraft] = useState(task.note ?? '')

  const row: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    padding: '3px 4px',
    borderRadius: 6,
  }
  const check: CSSProperties = { marginTop: 2, cursor: 'pointer', accentColor: T.success }
  const textDone: CSSProperties = {
    flex: 1,
    textDecoration: task.done ? 'line-through' : 'none',
    opacity: task.done ? 0.55 : 1,
    cursor: 'pointer',
    wordBreak: 'break-word',
    userSelect: 'text',
    color: T.text,
  }
  const noteStyle: CSSProperties = {
    color: T.textDim,
    fontSize: 12,
    opacity: task.done ? 0.5 : 1,
    wordBreak: 'break-word',
    userSelect: 'text',
  }

  return (
    <li style={row}>
      <input type="checkbox" checked={task.done} style={check} onChange={() => onToggle(task)} />
      <div style={{ flex: 1 }}>
        {editing ? (
          <input
            autoFocus
            style={inputStyle}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { if (draft.trim() !== task.text) onEdit(task, draft.trim()); setEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        ) : (
          <>
            <div
              style={textDone}
              onDoubleClick={() => { setDraft(task.text); setEditing(true) }}
              title="双击编辑"
            >
              {task.text || '（空）'}
            </div>
            {ageLabel && (
              <div style={{ ...noteStyle, marginTop: 1 }}>{ageLabel}</div>
            )}
            <div style={noteStyle} title="点击编辑备注">
              {noteEditing ? (
                <input
                  autoFocus
                  style={{ ...inputStyle, fontSize: 12 }}
                  value={noteDraft}
                  placeholder="备注…"
                  onChange={e => setNoteDraft(e.target.value)}
                  onBlur={() => { onNote(task, noteDraft.trim()); setNoteEditing(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              ) : (
                <div onClick={() => { setNoteDraft(task.note ?? ''); setNoteEditing(true) }}>
                  {task.note ? `[${task.note}]` : ''}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <button style={iconBtn} title="删除" onClick={() => onDelete(task)}>删除</button>
    </li>
  )
}

// --- panel (tucked by default) ---

export function StickyPanel({ sticky }: { sticky: StickyNamespaceFace }) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<StickyPlan | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [newText, setNewText] = useState('')
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<StickyStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    /** Panel top-left at drag start (from the live bounding rect), so the first
     *  real drag keeps the panel under the cursor instead of jumping to (0,0). */
    originX: number
    originY: number
    dragging: boolean
  } | null>(null)

  // --- AI 智能输入 ---
  const [inputMode, setInputMode] = useState<'manual' | 'ai'>('manual')
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiCandidates, setAiCandidates] = useState<Array<AiExtractTask & { checked: boolean }>>([])
  const [aiModel, setAiModel] = useState('')
  const [aiError, setAiError] = useState<string | null>(null)
  // '' = follow DSH's current model; otherwise "provider/model" chosen by the user.
  const [aiModelKey, setAiModelKey] = useState('')
  const [modelOptions, setModelOptions] = useState<ModelChoice[]>([])

  // --- 查漏 ---
  const [showGaps, setShowGaps] = useState(false)
  const [gaps, setGaps] = useState<GapScanResult | null>(null)
  const [gapsLoading, setGapsLoading] = useState(false)
  const [gapsError, setGapsError] = useState<string | null>(null)
  const [gapDrafts, setGapDrafts] = useState<Record<string, string>>({})
  const [gapChecked, setGapChecked] = useState<Record<string, boolean>>({})
  const [gapExpanded, setGapExpanded] = useState<Record<string, boolean>>({})
  const [gapsAdding, setGapsAdding] = useState(false)
  // "刚完成" items are noisy; show them only when the user opts in.
  const [showFresh, setShowFresh] = useState(false)

  const date = todayKey()

  // Populate the AI model selector from DSH's own LLM list when AI mode is shown.
  useEffect(() => {
    if (inputMode !== 'ai') return
    void (async () => {
      const res = await sticky.listModels()
      if (res.ok) setModelOptions(res.value.options)
    })()
  }, [inputMode, sticky])

  const load = useCallback(async () => {
    if (!open) return
    const res = await sticky.readPlan(date)
    if (res.ok) { setPlan(res.value); setError(null) }
    else setError(res.error?.message ?? '读取失败')
  }, [sticky, date, open])

  // Load when opened; poll only while open (so AI writes appear live).
  useEffect(() => {
    if (!open) return
    void load()
    const iv = setInterval(() => { void load() }, 4000)
    return () => clearInterval(iv)
  }, [open, load])

  const mutate = async (fn: () => Promise<RemoteResult<StickyPlan>>) => {
    const res = await fn()
    if (res.ok) {
      setPlan(res.value)
      setError(null)
    } else {
      setError(res.error?.message ?? '操作失败')
    }
  }

  const addOne = () => {
    const text = newText.trim()
    if (!text) return
    void mutate(() => sticky.addTask({ date, text }))
    setNewText('')
  }

  const onBulk = () => {
    const lines = newText.split('\n').map(l => l.replace(/^\s*-\s*\[\s*\]\s*/, '').trim()).filter(Boolean)
    if (lines.length === 0) return
    void (async () => {
      for (const line of lines) await sticky.addTask({ date, text: line })
      await load()
    })()
    setNewText('')
  }

  const runAiExtract = async () => {
    const text = aiText.trim()
    if (!text) return
    setAiLoading(true)
    setAiError(null)
    let override: { provider: string; model: string } | undefined
    if (aiModelKey) {
      const i = aiModelKey.indexOf('/')
      if (i > 0 && i < aiModelKey.length - 1) {
        override = { provider: aiModelKey.slice(0, i), model: aiModelKey.slice(i + 1) }
      }
    }
    const res = await sticky.aiExtract({ text, ...(override ? { model: override } : {}) })
    if (res.ok) {
      setAiCandidates(res.value.tasks.map(t => ({ ...t, checked: true })))
      setAiModel(res.value.model)
    } else {
      setAiCandidates([])
      setAiError(res.error?.message ?? 'AI 抽取失败')
    }
    setAiLoading(false)
  }

  const addAiCandidates = async () => {
    const picked = aiCandidates.filter(c => c.checked)
    if (picked.length === 0) return
    setAiLoading(true)
    for (const c of picked) {
      const text = c.text.trim()
      if (!text) continue
      await sticky.addTask({ date, text, ...(c.note ? { note: c.note } : {}) })
    }
    await load()
    setAiCandidates([])
    setAiText('')
    setAiModel('')
    setAiLoading(false)
  }

  const runGapScan = async () => {
    // Show the (inline, non-blocking) results section right away so the user
    // sees the scan state instead of a full-screen mask.
    setShowGaps(true)
    setGapsLoading(true)
    setGapsError(null)
    const res = await sticky.scanGaps({ days: 2 })
    if (res.ok) {
      setGaps(res.value)
      const drafts: Record<string, string> = {}
      const checked: Record<string, boolean> = {}
      for (const s of res.value.sessions) {
        if (s.status === 'read' || (s.status === 'fresh' && !showFresh)) continue
        drafts[s.session_id] = s.last_user_text
        checked[s.session_id] = true
      }
      setGapDrafts(drafts)
      setGapChecked(checked)
      setGapExpanded({})
    } else {
      setGapsError(res.error?.message ?? '查漏失败')
    }
    setGapsLoading(false)
  }

  const addGapItems = async () => {
    if (!gaps) return
    const picked = gaps.sessions.filter(s => s.status !== 'read' && (s.status !== 'fresh' || showFresh) && gapChecked[s.session_id])
    if (picked.length === 0) return
    setGapsAdding(true)
    const tagged: Array<{ session_id: string; status: 'added' }> = []
    for (const s of picked) {
      const text = (gapDrafts[s.session_id] ?? s.last_user_text).trim()
      if (!text) continue
      await sticky.addTask({ date, text })
      tagged.push({ session_id: s.session_id, status: 'added' })
    }
    if (tagged.length > 0) {
      // Tag as handled so future 查漏 stops showing them.
      const res = await sticky.tagGaps({ sessions: tagged })
      if (res.ok) setGaps(res.value)
      else setGapsError(res.error?.message ?? '标记已处理失败')
    }
    await load()
    setGapsAdding(false)
    setShowGaps(false)
    setGaps(null)
    setGapsError(null)
  }

  const ignoreGap = async (id: string) => {
    const res = await sticky.tagGaps({ sessions: [{ session_id: id, status: 'ignored' }] })
    if (res.ok) {
      setGaps(res.value)
      // Rebuild drafts/checked for the sessions still shown.
      const drafts: Record<string, string> = {}
      const checked: Record<string, boolean> = {}
      for (const s of res.value.sessions) {
        if (s.status === 'read' || (s.status === 'fresh' && !showFresh)) continue
        drafts[s.session_id] = gapDrafts[s.session_id] ?? s.last_user_text
        checked[s.session_id] = gapChecked[s.session_id] ?? true
      }
      setGapDrafts(drafts)
      setGapChecked(checked)
      setGapsError(null)
    } else {
      setGapsError(res.error?.message ?? '忽略失败')
    }
  }

  const toggleStats = async () => {
    const next = !showStats
    setShowStats(next)
    if (next && stats === null) {
      const res = await sticky.stats({ date })
      if (res.ok) setStats(res.value)
      else setError(res.error?.message ?? '统计读取失败')
    }
  }

  const onDragStart = (e: ReactPointerEvent) => {
    // Never initiate a drag from a control (buttons/inputs/links): keeps the
    // header buttons (查漏/统计/收起/✕) clickable without dragging the panel.
    const target = e.target as HTMLElement
    if (target.closest('button, input, textarea, a')) return
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      dragging: false,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture is best-effort
    }
  }
  const onDragMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    // Ignore micro-movements: a plain click never nudges the panel position.
    if (!d.dragging && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    d.dragging = true
    setPos({ x: d.originX + dx, y: d.originY + dy })
  }
  const onDragEnd = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (d && d.pointerId !== e.pointerId) return
    dragRef.current = null
  }

  const doneCount = plan ? plan.tasks.filter(t => t.done).length : 0
  const totalCount = plan ? plan.tasks.length : 0
  const badge = totalCount > 0 ? `${doneCount}/${totalCount}` : ''
  const aiPickedCount = aiCandidates.filter(c => c.checked).length

  const modeTab = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: '3px 0',
    textAlign: 'center',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 5,
    border: `1px solid ${active ? T.accent : 'transparent'}`,
    color: active ? T.accent : T.textDim,
    background: active ? 'var(--dsw-alias-state-business-primary-subtle, rgba(0,0,0,0.06))' : 'transparent',
  })

  return (
    <>
      <SummonButton count={badge} onOpen={() => setOpen(v => !v)} />

      {open && (
        <div
          ref={panelRef}
          style={{ ...panelStyle, ...(pos ? { top: pos.y, right: undefined, left: pos.x } : {}) }}
        >
          <div
            style={headerStyle}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            <span style={titleStyle} title={date}>今日便签 {badge !== '' ? `(${badge})` : ''}</span>
            <button style={iconBtn} title="查漏（近 2 天未决会话）" onClick={() => void runGapScan()}>查漏</button>
            <button style={iconBtn} title="统计（周/月环比）" onClick={() => void toggleStats()}>统计</button>
            <button style={iconBtn} title={collapsed ? '展开' : '收起'} onClick={() => setCollapsed(c => !c)}>{collapsed ? '展开' : '收起'}</button>
            <button style={iconBtn} title="关闭" onClick={() => setOpen(false)}>✕</button>
          </div>

          {error && (
            <div style={{ padding: '4px 10px', color: T.danger, fontSize: 12 }}>{error}</div>
          )}

          {!collapsed && (
            <>
              <div style={bodyStyle}>
                {gapsLoading && (
                  <div style={{ padding: '6px 8px', color: T.textDim, fontSize: 12 }}>查漏中，扫描近 2 天会话…</div>
                )}
                {showGaps && gaps && (
                  <GapSection
                    result={gaps}
                    drafts={gapDrafts}
                    checked={gapChecked}
                    expanded={gapExpanded}
                    adding={gapsAdding}
                    error={gapsError}
                    showFresh={showFresh}
                    onDraft={(id, text) => setGapDrafts(prev => ({ ...prev, [id]: text }))}
                    onToggle={id => setGapChecked(prev => ({ ...prev, [id]: !prev[id] }))}
                    onExpand={id => setGapExpanded(prev => ({ ...prev, [id]: !prev[id] }))}
                    onIgnore={id => void ignoreGap(id)}
                    onClose={() => { setShowGaps(false); setGaps(null); setGapsError(null) }}
                    onAdd={() => void addGapItems()}
                    onToggleFresh={() => setShowFresh(v => !v)}
                  />
                )}
                {showStats && stats && (
                  <StatsSection stats={stats} onClose={() => setShowStats(false)} />
                )}
                {plan && plan.tasks.length === 0 ? (
                  <div style={{ color: T.textFaint, padding: 8 }}>今天还没有任务。在下面添加，或让 AI 帮你记（「把这个加进便签」）。</div>
                ) : (
                  <ul style={listStyle}>
                    {plan?.tasks.map(t => (
                      <TaskRow
                        key={t.task_id}
                        task={t}
                        ageLabel={ageOf(t, date)}
                        onToggle={t => void mutate(() => sticky.setDone({ date, task_id: t.task_id, done: !t.done }))}
                        onEdit={(t, text) => void mutate(() => sticky.editTask({ date, task_id: t.task_id, text }))}
                        onDelete={t => void mutate(() => sticky.deleteTask({ date, task_id: t.task_id }))}
                        onNote={(t, note) => void mutate(() => sticky.setNote({ date, task_id: t.task_id, note }))}
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ display: 'flex', gap: 4, padding: '6px 8px 0', flexShrink: 0 }}>
                <button style={modeTab(inputMode === 'manual')} onClick={() => setInputMode('manual')}>手动</button>
                <button style={modeTab(inputMode === 'ai')} onClick={() => setInputMode('ai')}>AI 智能</button>
              </div>

              {inputMode === 'manual' && (
                <div style={addRowStyle}>
                  <input
                    style={inputStyle}
                    value={newText}
                    placeholder="输入任务，回车添加；多行粘贴可批量"
                    onChange={e => setNewText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (newText.includes('\n')) onBulk(); else addOne() }
                    }}
                  />
                  <button style={{ ...iconBtn, color: T.accent }} title="添加" onClick={() => { if (newText.includes('\n')) onBulk(); else addOne() }}>添加</button>
                </div>
              )}

              {inputMode === 'ai' && (
                <div style={{ borderTop: `1px solid ${T.borderSoft}`, flexShrink: 0 }}>
                  <div style={{ padding: '6px 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: T.textFaint, fontSize: 11, whiteSpace: 'nowrap' }}>模型</span>
                    <select
                      style={{ ...inputStyle, fontSize: 12, flex: 1 }}
                      value={aiModelKey}
                      onChange={e => setAiModelKey(e.target.value)}
                      title="抽取用的模型：默认跟随 DSH 当前模型，也可指定一个"
                    >
                      <option value="">跟随当前模型（自动）</option>
                      {modelOptions.map(o => (
                        <option key={`${o.provider}/${o.model}`} value={`${o.provider}/${o.model}`}>
                          {o.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={addRowStyle}>
                    <textarea
                      style={{ ...inputStyle, minHeight: 64, resize: 'vertical', lineHeight: 1.5 }}
                      value={aiText}
                      placeholder="贴一段乱七八糟的话 / 语音转文字，AI 抽成便签任务…"
                      onChange={e => setAiText(e.target.value)}
                    />
                    <button
                      style={{ ...iconBtn, color: T.accent, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}
                      disabled={aiLoading || !aiText.trim()}
                      onClick={() => void runAiExtract()}
                    >
                      {aiLoading ? '抽取中…' : 'AI 抽取'}
                    </button>
                  </div>
                  {aiError && <div style={{ padding: '0 10px 6px', color: T.danger, fontSize: 12 }}>{aiError}</div>}
                  {aiCandidates.length > 0 && (
                    <div style={{ padding: '0 10px 8px', borderTop: `1px solid ${T.borderSoft}` }}>
                      <div style={{ fontWeight: 600, fontSize: 12, margin: '6px 0 4px' }}>
                        AI 抽出 {aiCandidates.length} 条{aiModel ? `（${aiModel}）` : ''}
                      </div>
                      {aiCandidates.map((c, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                          <input
                            type="checkbox"
                            style={{ marginTop: 3, accentColor: T.accent }}
                            checked={c.checked}
                            onChange={() => setAiCandidates(prev => prev.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}
                          />
                          <input
                            style={{ ...inputStyle, fontSize: 12 }}
                            value={c.text}
                            onChange={e => setAiCandidates(prev => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                          />
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                        <button style={iconBtn} onClick={() => { setAiCandidates([]); setAiModel('') }}>取消</button>
                        <button
                          style={{ ...iconBtn, color: aiPickedCount > 0 ? T.accent : T.textFaint, whiteSpace: 'nowrap' }}
                          disabled={aiPickedCount === 0 || aiLoading}
                          onClick={() => void addAiCandidates()}
                        >
                          添加 {aiPickedCount} 条到便签
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
