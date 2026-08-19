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
/** Byte range of one structurally complete Zstandard frame. */
export interface ZstdFrameRange {
    start: number;
    end: number;
}
/**
 * Locate complete Zstandard frames without decompressing their blocks
 * (standard frame header: magic + descriptor + optional window/content size +
 * blocks + optional 4-byte checksum). Returns the frames we could parse; a
 * structurally broken file simply yields fewer frames rather than throwing.
 */
export declare function scanZstdFrames(buffer: Buffer, maxFrames?: number): ZstdFrameRange[];
/** Decompress a concatenated-frame session log; corrupt/torn frames are skipped. */
export declare function decompressSessionLog(buffer: Buffer): string;
/** Human-readable workspace label from the encoded dir name. */
export declare function wsLabel(ws: string): string;
/** One gap candidate surfaced by the scan. */
export interface GapSession {
    sessionId: string;
    title: string;
    workspace: string;
    workspaceLabel: string;
    lastActive: string;
    unread: boolean;
    /**
     * Classification of why this conversation needs the user:
     * - `unread`  — last is a user message with no AI reply (你问没答)
     * - `awaiting` — last is the AI asking something / waiting for the user (模型在等你)
     * - `fresh`   — last is the AI finishing recently, user hasn't replied (刚完成)
     * - `read`    — normal, nothing to do
     */
    status: 'read' | 'unread' | 'awaiting' | 'fresh';
    /** Last few turns, formatted for display (时间 + 你/AI 摘要). */
    excerpt: string[];
    /** The last user message text, offered as the default "add as task" text. */
    lastUserText: string;
}
/** Resolve the sessions root dir (same convention as DSH's `dshHomePath('sessions')`). */
export declare function sessionsRoot(): string;
/**
 * Scan all sessions for the given window and return gap candidates.
 * @param root - the sessions root (defaults to <DSH_HOME>/.dsh/sessions).
 * @param days - window size; only sessions updated in the last `days` days.
 * @param tailTurns - how many trailing turns to include in each excerpt.
 * @param maxChars - cap on each user turn's excerpt length.
 */
export declare function scanGapSessions(root?: string, days?: number, tailTurns?: number, maxChars?: number): GapSession[];
