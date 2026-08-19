/**
 * dsh-daily-sticky gap scanner ("查漏"): scan DSH's session logs for
 * conversations updated in the last N days that end with an unanswered user
 * turn — the same heuristic the daily-voice-plan skill's scan_sessions.py
 * uses, reimplemented in the plugin host so the 查漏 button needs no external
 * script or Python. Session logs live under <DSH_HOME>/sessions as
 * concatenated Zstandard frames; Node's built-in `node:zlib` decodes each
 * frame (the sync one-shot API only decodes the first frame, so we split by
 * frame first).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import os from 'node:os'

/** Byte range of one structurally complete Zstandard frame. */
export interface ZstdFrameRange {
  start: number
  end: number
}

const ZSTD_MAGIC = 0xFD2FB528

/**
 * Locate complete Zstandard frames without decompressing their blocks
 * (standard frame header: magic + descriptor + optional window/content size +
 * blocks + optional 4-byte checksum). Returns the frames we could parse; a
 * structurally broken file simply yields fewer frames rather than throwing.
 */
export function scanZstdFrames(buffer: Buffer, maxFrames = Number.POSITIVE_INFINITY): ZstdFrameRange[] {
  const frames: ZstdFrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return frames
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return frames
    offset += 4
    if (offset === buffer.length) return frames
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) return frames // reserved frame-header bits
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return frames
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return frames
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) return frames // reserved block type
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return frames
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return frames
      offset += 4
    }
    frames.push({ start, end: offset })
    if (frames.length === maxFrames) return frames
  }
  return frames
}

/** Decompress a concatenated-frame session log; corrupt/torn frames are skipped. */
export function decompressSessionLog(buffer: Buffer): string {
  let out = ''
  for (const f of scanZstdFrames(buffer)) {
    try {
      out += zstdDecompressSync(buffer.subarray(f.start, f.end)).toString('utf8')
    } catch {
      // skip one bad frame, keep the readable ones
    }
  }
  return out
}

// --- dialog extraction (mirrors scripts/scan_sessions.py) ---

const DIALOG_TYPES = new Set(['user/message', 'assistant/message', 'session/title'])
const SKIP_PREFIXES = [
  '<system-reminder>',
  '<system_reminder>',
  'The approval policy changed',
  '<available_skills>',
  'Current runtime context',
  'Current DSH file policy',
]

interface JsonRow {
  type?: string
  time?: number | string
  data?: Record<string, unknown>
}

function rowTimeMs(o: JsonRow): number | undefined {
  const t = o.time
  if (typeof t === 'number') return t
  if (typeof t === 'string') {
    const ms = Date.parse(t)
    return Number.isNaN(ms) ? undefined : ms
  }
  return undefined
}

/** User message text; injected system notices are treated as empty (skip). */
function userText(o: JsonRow): string {
  const d = o.data ?? {}
  let content: unknown = d.content
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content)
    } catch {
      // keep the raw string
    }
  }
  if (Array.isArray(content)) {
    content = content
      .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
      .map(b => (typeof b.text === 'string' ? b.text : typeof b.content === 'string' ? b.content : ''))
      .join('\n')
  }
  const s = typeof content === 'string' ? content : ''
  for (const p of SKIP_PREFIXES) {
    if (s.startsWith(p)) return ''
  }
  return s.slice(0, 4000)
}

/** Assistant final text only: text/content blocks, reasoning and tool calls dropped. */
function assistantText(o: JsonRow): string {
  const d = o.data ?? {}
  const msg = d.message && typeof d.message === 'object' ? d.message as Record<string, unknown> : null
  const content = msg?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
      .filter(b => b.type === 'text' || b.type === 'content')
      .map(b => (typeof b.text === 'string' ? b.text : typeof b.content === 'string' ? b.content : ''))
      .join('\n')
  }
  return ''
}

/** Session title (latest wins). */
function titleOf(rows: JsonRow[]): string {
  let title = ''
  for (const o of rows) {
    if (o.type !== 'session/title') continue
    const t = (o.data?.title as string | undefined)?.trim()
    if (t) title = t
  }
  return title
}

/** Human-readable workspace label from the encoded dir name. */
export function wsLabel(ws: string): string {
  if (ws.includes('--')) {
    const s = ws.replace('--', '').split('--')[0] ?? ws
    return s
  }
  return ws
}

function formatTs(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatActive(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** One gap candidate surfaced by the scan. */
export interface GapSession {
  sessionId: string
  title: string
  workspace: string
  workspaceLabel: string
  lastActive: string
  unread: boolean
  /**
   * Classification of why this conversation needs the user:
   * - `unread`  — last is a user message with no AI reply (你问没答)
   * - `awaiting` — last is the AI asking something / waiting for the user (模型在等你)
   * - `fresh`   — last is the AI finishing recently, user hasn't replied (刚完成)
   * - `read`    — normal, nothing to do
   */
  status: 'read' | 'unread' | 'awaiting' | 'fresh'
  /** Last few turns, formatted for display (时间 + 你/AI 摘要). */
  excerpt: string[]
  /** The last user message text, offered as the default "add as task" text. */
  lastUserText: string
}

/** Heuristic: does this assistant text look like it is waiting for the user? */
function looksLikeAwaiting(text: string): boolean {
  const tail = (text || '').trim().slice(-120)
  if (!tail) return false
  if (/[？?]/.test(tail)) return true
  return /(吗|呢|嘛|如何|怎样|怎么|要不要|可不可以|行不行|好不好|是否可以|还是|哪些|哪个|哪几|几块|几个|几类|几项)[，。,.;；…）)」』]?$/.test(tail)
}

interface Turn {
  ts: number
  user: string
  assistant: string | null
}

function analyzeSession(
  raw: string,
  sessionId: string,
  workspace: string,
  sinceMs: number,
  tailTurns: number,
  maxChars: number,
): GapSession | null {
  const rows: JsonRow[] = []
  for (const ln of raw.split('\n')) {
    if (!ln.trim()) continue
    try {
      rows.push(JSON.parse(ln) as JsonRow)
    } catch {
      // skip malformed line
    }
  }

  const title = titleOf(rows)

  const dialog: Array<{ ts: number; kind: string; text: string }> = []
  let lastTs = 0
  for (const o of rows) {
    if (!o.type || !DIALOG_TYPES.has(o.type)) continue
    const ts = rowTimeMs(o)
    if (ts === undefined || ts < sinceMs) continue
    const text = o.type === 'user/message' ? userText(o) : assistantText(o)
    if (o.type === 'user/message' && !text.trim()) continue
    dialog.push({ ts, kind: o.type, text })
    if (ts > lastTs) lastTs = ts
  }
  if (dialog.length === 0) return null

  // Aggregate into turns: each user message → the next assistant message.
  const turns: Turn[] = []
  let pending: { ts: number; text: string } | null = null
  for (const row of dialog) {
    if (row.kind === 'user/message') {
      pending = { ts: row.ts, text: row.text }
    } else if (row.kind === 'assistant/message' && pending) {
      turns.push({ ts: pending.ts, user: pending.text, assistant: row.text })
      pending = null
    }
  }
  if (pending) {
    turns.push({ ts: pending.ts, user: pending.text, assistant: null })
  }

  const tail = turns.slice(-tailTurns)
  const unread = tail.length > 0 && tail[tail.length - 1].assistant === null

  // Classify why this session needs the user's attention:
  //  - unread   (你问没答): last is a user message with no AI reply
  //  - awaiting (模型在等你): last is the AI asking / waiting for the user
  //  - fresh    (刚完成): last is the AI finishing within the last 24h, no user
  //    reply since. This one is noisy, so the client hides it by default and
  //    only shows it when the user opts in.
  const now = Date.now()
  let status: GapSession['status'] = 'read'
  if (unread) {
    status = 'unread'
  } else {
    const last = dialog[dialog.length - 1]
    if (last && last.kind === 'assistant/message') {
      if (looksLikeAwaiting(last.text)) status = 'awaiting'
      else if (lastTs >= now - 24 * 60 * 60 * 1000) status = 'fresh'
    }
  }

  const excerpt = tail.map(t => {
    const us = t.user.replace(/\n/g, ' ').trim()
    const usPart = `[${formatTs(t.ts)}] 你：${us.slice(0, maxChars)}${us.length > maxChars ? '…' : ''}`
    if (t.assistant !== null) {
      const at = t.assistant.replace(/\n/g, ' ').trim()
      const tailAt = at.length > 240 ? `…${at.slice(-240)}` : at
      return `${usPart}\n    AI：…${tailAt}`
    }
    return `${usPart}\n    ⚠ 无 AI 回复`
  })

  const lastUserText = tail.length > 0 ? tail[tail.length - 1].user.trim() : ''

  return {
    sessionId,
    title,
    workspace,
    workspaceLabel: wsLabel(workspace),
    lastActive: formatActive(lastTs),
    unread,
    status,
    excerpt,
    lastUserText: lastUserText.slice(0, 500),
  }
}

/** Resolve the sessions root dir (same convention as DSH's `dshHomePath('sessions')`). */
export function sessionsRoot(): string {
  const env = process.env.DSH_HOME
  const home = env && env.trim() ? env.trim() : join(os.homedir(), '.dsh')
  return join(home, 'sessions')
}

/**
 * Scan all sessions for the given window and return gap candidates.
 * @param root - the sessions root (defaults to <DSH_HOME>/.dsh/sessions).
 * @param days - window size; only sessions updated in the last `days` days.
 * @param tailTurns - how many trailing turns to include in each excerpt.
 * @param maxChars - cap on each user turn's excerpt length.
 */
export function scanGapSessions(
  root = sessionsRoot(),
  days = 2,
  tailTurns = 2,
  maxChars = 300,
): GapSession[] {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000
  const out: GapSession[] = []
  if (!existsSync(root)) return out
  for (const ws of readdirSync(root)) {
    const wsDir = join(root, ws)
    let isDir = false
    try {
      isDir = statSync(wsDir).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue
    for (const sess of readdirSync(wsDir)) {
      const sp = join(wsDir, sess, 'session.jsonl.zstd')
      if (!existsSync(sp)) continue
      let mtime = 0
      try {
        mtime = statSync(sp).mtimeMs
      } catch {
        continue
      }
      if (mtime < sinceMs) continue // fast filter: not updated in window
      let raw = ''
      try {
        raw = decompressSessionLog(readFileSync(sp))
      } catch {
        continue
      }
      const r = analyzeSession(raw, sess, ws, sinceMs, tailTurns, maxChars)
      if (r) out.push(r)
    }
  }
  // Most recent first.
  return out.sort((a, b) => (a.lastActive < b.lastActive ? 1 : -1))
}
