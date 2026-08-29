import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { DiscoveryService } from './discoveryService';
import { calculateCost, Usage } from '../types/models';
import { getClaudeConfigDir } from '../utils/claudePaths';

export interface PerSessionAggregate {
  sessionId: string;
  filePath: string;
  project: string;          // human-readable project label (from the session's cwd, else the dir slug)
  projectDir: string;       // directory name under ~/.claude/projects/
  model: string;            // primary model used
  firstTimestamp: number;   // ms
  lastTimestamp: number;    // ms
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  totalCost: number;
  registryName?: string;
  registrySection?: string;
}

export interface PerProjectAggregate {
  project: string;          // human-readable label
  projectDir: string;       // dir name
  sessionCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  totalCost: number;
  lastActivity: number;     // ms
  modelBreakdown: Record<string, number>; // model -> cost
}

export interface PerDayAggregate {
  isoDate: string;          // YYYY-MM-DD (local time)
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  totalCost: number;
  sessionCount: number;
}

export interface PerModelAggregate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  totalCost: number;
}

export interface WorkspaceAggregate {
  /** rolling window covered: [from, to] in ms */
  windowFrom: number;
  windowTo: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreateTokens: number;
  perDay: PerDayAggregate[];        // sorted ascending by date
  perProject: PerProjectAggregate[];// sorted descending by cost
  perModel: PerModelAggregate[];    // sorted descending by cost
  perSession: PerSessionAggregate[];// sorted descending by lastTimestamp
  scannedFileCount: number;
  scannedAt: number;
}

interface FileCacheEntry {
  mtimeMs: number;
  size: number;
  agg: PerSessionAggregate;
}

/** Same convention as DiscoveryService.humanProjectName: last two path segments. */
function humanProjectName(pathStr: string): string {
  const parts = pathStr.split(/[\\/]/).filter(p => p);
  if (parts.length === 0) return pathStr;
  if (parts.length <= 2) return parts.join('/');
  return parts.slice(-2).join('/');
}

function isoLocalDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Aggregates token usage and cost across every Claude Code session JSONL on
 * disk. Streams each line so we don't load full transcripts into memory.
 * Caches per-file results by (mtime, size) so repeat opens are fast.
 */
export class AggregationService {
  private _fileCache = new Map<string, FileCacheEntry>();

  constructor(private readonly _discovery: DiscoveryService) {}

  /**
   * Parse a single JSONL and produce a session-level aggregate. Uses the
   * cache if the file's (mtime, size) is unchanged from last parse.
   */
  async aggregateFile(filePath: string): Promise<PerSessionAggregate | null> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return null;
    }
    const cached = this._fileCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.agg;
    }

    const sessionId = path.basename(filePath, '.jsonl');
    const projectDir = path.basename(path.dirname(filePath));
    let cwd = '';
    let model = 'unknown';
    let firstTimestamp = 0;
    let lastTimestamp = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreateTokens = 0;
    let totalCost = 0;

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt: any;
      try {
        evt = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const ts = evt.timestamp ? Date.parse(evt.timestamp) : 0;
      if (ts) {
        if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
        if (ts > lastTimestamp) lastTimestamp = ts;
      }
      // Anthropic API response objects in Claude Code JSONL have
      // message.model + message.usage on assistant responses.
      if (!cwd && typeof evt.cwd === 'string' && evt.cwd) {
        cwd = evt.cwd;
      }
      const msg = evt.message;
      // Claude Code inserts placeholder assistant turns with model "<synthetic>";
      // they carry no billable usage and would otherwise be costed at the
      // fallback price. ParserService skips them the same way.
      if (msg?.model === '<synthetic>') continue;
      const usage = msg?.usage;
      if (msg?.model && typeof msg.model === 'string') {
        model = msg.model;
      }
      if (usage && typeof usage === 'object') {
        const u: Usage = {
          input_tokens: usage.input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
          cache_read_input_tokens: usage.cache_read_input_tokens || 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
        };
        inputTokens += u.input_tokens;
        outputTokens += u.output_tokens;
        cacheReadTokens += u.cache_read_input_tokens;
        cacheCreateTokens += u.cache_creation_input_tokens;
        totalCost += calculateCost(u, msg.model || model);
      }
    }

    if (!firstTimestamp && !lastTimestamp) return null;

    const agg: PerSessionAggregate = {
      sessionId,
      filePath,
      project: cwd ? humanProjectName(cwd) : projectDir,
      projectDir,
      model,
      firstTimestamp,
      lastTimestamp: lastTimestamp || firstTimestamp,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreateTokens,
      totalCost,
    };
    this._fileCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, agg });
    return agg;
  }

  /**
   * Walk all sessions on disk and produce a full workspace aggregate. The
   * `windowFromMs` cap restricts the per-day/per-project/per-model
   * aggregates to a date range (e.g., this-week); the per-session list is
   * always full so the UI can sort/filter.
   */
  async aggregateAll(
    windowFromMs: number,
    windowToMs: number,
    onProgress?: (done: number, total: number) => void,
    registryLookup?: (id: string) => { name: string; section: string } | undefined,
  ): Promise<WorkspaceAggregate> {
    // Find every .jsonl under ~/.claude/projects/
    const root = path.join(getClaudeConfigDir(), 'projects');
    const files = await this._walkJsonl(root);

    const perSession: PerSessionAggregate[] = [];
    let done = 0;
    for (const filePath of files) {
      const agg = await this.aggregateFile(filePath);
      done += 1;
      if (onProgress && (done % 25 === 0 || done === files.length)) {
        onProgress(done, files.length);
      }
      if (!agg) continue;
      if (registryLookup) {
        const hit = registryLookup(agg.sessionId);
        if (hit) {
          agg.registryName = hit.name;
          agg.registrySection = hit.section;
        }
      }
      perSession.push(agg);
    }

    // Per-day / per-project / per-model rollups (window-scoped)
    const dayMap = new Map<string, PerDayAggregate>();
    const projMap = new Map<string, PerProjectAggregate>();
    const modelMap = new Map<string, PerModelAggregate>();
    let totalCost = 0;
    let totalIn = 0;
    let totalOut = 0;
    let totalCR = 0;
    let totalCC = 0;

    for (const s of perSession) {
      // A session is "in window" if any of its activity overlaps the window.
      // For day-bucket aggregation we need per-line resolution we don't
      // currently keep, so we approximate by attributing the full session
      // to the day of lastTimestamp when it falls in the window. This is
      // accurate enough for week-scale views; a future refinement could
      // attribute per-message.
      if (s.lastTimestamp < windowFromMs || s.firstTimestamp > windowToMs) continue;
      totalCost += s.totalCost;
      totalIn += s.inputTokens;
      totalOut += s.outputTokens;
      totalCR += s.cacheReadTokens;
      totalCC += s.cacheCreateTokens;

      const iso = isoLocalDate(s.lastTimestamp);
      const day = dayMap.get(iso) || {
        isoDate: iso, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        cacheCreateTokens: 0, totalCost: 0, sessionCount: 0,
      };
      day.inputTokens += s.inputTokens;
      day.outputTokens += s.outputTokens;
      day.cacheReadTokens += s.cacheReadTokens;
      day.cacheCreateTokens += s.cacheCreateTokens;
      day.totalCost += s.totalCost;
      day.sessionCount += 1;
      dayMap.set(iso, day);

      const proj = projMap.get(s.projectDir) || {
        project: s.project, projectDir: s.projectDir, sessionCount: 0, inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 0, cacheCreateTokens: 0, totalCost: 0, lastActivity: 0,
        modelBreakdown: {},
      };
      proj.sessionCount += 1;
      proj.inputTokens += s.inputTokens;
      proj.outputTokens += s.outputTokens;
      proj.cacheReadTokens += s.cacheReadTokens;
      proj.cacheCreateTokens += s.cacheCreateTokens;
      proj.totalCost += s.totalCost;
      proj.lastActivity = Math.max(proj.lastActivity, s.lastTimestamp);
      proj.modelBreakdown[s.model] = (proj.modelBreakdown[s.model] || 0) + s.totalCost;
      projMap.set(s.projectDir, proj);

      const m = modelMap.get(s.model) || {
        model: s.model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        cacheCreateTokens: 0, totalCost: 0,
      };
      m.inputTokens += s.inputTokens;
      m.outputTokens += s.outputTokens;
      m.cacheReadTokens += s.cacheReadTokens;
      m.cacheCreateTokens += s.cacheCreateTokens;
      m.totalCost += s.totalCost;
      modelMap.set(s.model, m);
    }

    // Fill the per-day array with empty days in the window so the bar chart
    // renders a continuous spine.
    const dayCount = Math.max(1, Math.ceil((windowToMs - windowFromMs) / 86400000));
    const perDay: PerDayAggregate[] = [];
    for (let i = 0; i < dayCount; i++) {
      const iso = isoLocalDate(windowFromMs + i * 86400000);
      perDay.push(dayMap.get(iso) || {
        isoDate: iso, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        cacheCreateTokens: 0, totalCost: 0, sessionCount: 0,
      });
    }
    perDay.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

    const perProject = Array.from(projMap.values()).sort((a, b) => b.totalCost - a.totalCost);
    const perModel = Array.from(modelMap.values()).sort((a, b) => b.totalCost - a.totalCost);
    perSession.sort((a, b) => b.lastTimestamp - a.lastTimestamp);

    return {
      windowFrom: windowFromMs,
      windowTo: windowToMs,
      totalCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      totalCacheReadTokens: totalCR,
      totalCacheCreateTokens: totalCC,
      perDay,
      perProject,
      perModel,
      perSession,
      scannedFileCount: files.length,
      scannedAt: Date.now(),
    };
  }

  private async _walkJsonl(root: string): Promise<string[]> {
    const out: string[] = [];
    // Layout is ~/.claude/projects/<project-slug>/<sessionId>.jsonl. Sub-agent
    // transcripts live deeper (<slug>/<sessionId>/subagents/*.jsonl) and are
    // already accounted for by their parent session, so only descend one level.
    let slugs: fs.Dirent[];
    try {
      slugs = await fs.promises.readdir(root, { withFileTypes: true });
    } catch { return out; }
    for (const slug of slugs) {
      if (!slug.isDirectory()) continue;
      const dir = path.join(root, slug.name);
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch { continue; }
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.jsonl')) out.push(path.join(dir, e.name));
      }
    }
    return out;
  }
}
