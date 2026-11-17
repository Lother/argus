/**
 * The arithmetic behind the Insights tab's tools. Pure functions over the
 * flattened timeline, kept apart from the components so each number can be
 * checked against a real transcript without rendering anything.
 *
 * Everything here reasons per *stream*: the main session and every sub-agent
 * keep their own conversation and their own prompt cache, so "the request
 * before this one" only means something inside one agent.
 */

import type { Step, Subagent } from '../types/session';
import {
  CACHE_WRITE_1H_RATIO,
  CACHE_WRITE_5M_RATIO,
  cacheReadRate,
  calculateCostBreakdown,
  getModelPricing,
  normalizeModelId,
} from '../../../src/types/pricing';
import { roughTokens } from '../../../src/types/usage';

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/** Dollars per token for one response, fast mode included. */
interface Rates {
  input: number;
  output: number;
  read: number;
}

const rateCache = new Map<string, Rates>();

function ratesOf(step: Step): Rates {
  const fast = step.usage?.speed === 'fast';
  const cacheKey = `${step.model ?? ''}|${fast ? 'fast' : ''}`;
  const hit = rateCache.get(cacheKey);
  if (hit) return hit;
  const pricing = getModelPricing(step.model ?? '');
  const inRate =
    fast && pricing.fastInputPerMillion !== undefined
      ? pricing.fastInputPerMillion
      : pricing.inputPerMillion;
  const outRate =
    fast && pricing.fastOutputPerMillion !== undefined
      ? pricing.fastOutputPerMillion
      : pricing.outputPerMillion;
  const rates = {
    input: inRate / 1_000_000,
    output: outRate / 1_000_000,
    read: cacheReadRate(pricing, inRate) / 1_000_000,
  };
  rateCache.set(cacheKey, rates);
  return rates;
}

const time = (step: Step | undefined): number => {
  const ms = step?.timestamp ? Date.parse(step.timestamp) : NaN;
  return Number.isFinite(ms) ? ms : NaN;
};

const key = (step: Step): number => step.globalIndex ?? step.index;

/** Everything the request was sent with: fresh input, cache reads and cache writes. */
function promptSize(step: Step): number {
  const u = step.usage;
  if (!u) return 0;
  return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
}

function wrote1h(step: Step): boolean {
  return (step.usage?.cache_creation?.ephemeral_1h_input_tokens ?? 0) > 0;
}

/** Cost per token of writing this response's cache entries, at its own TTL mix. */
function writeRate(step: Step, rates: Rates): number {
  const u = step.usage;
  const w5 = u?.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const w1 = u?.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  if (w5 + w1 === 0) return rates.input * CACHE_WRITE_5M_RATIO;
  return rates.input * ((w5 * CACHE_WRITE_5M_RATIO + w1 * CACHE_WRITE_1H_RATIO) / (w5 + w1));
}

/** One API response inside one stream, with the tool calls it made. */
interface Response {
  head: Step;
  /** Every step the response produced, in order. */
  steps: Step[];
  tools: Step[];
  /** Compactions seen in this stream before the response. */
  segment: number;
  /** A message reached the model between the previous response and this one. */
  afterUser: boolean;
  lastTime: number;
}

/** Rough size of what a response itself wrote: text, reasoning, tool inputs. */
function roughOutput(response: Response): number {
  let total = 0;
  for (const step of response.steps) {
    if (step.type === 'tool_call') {
      if (step.toolInput !== undefined) total += roughTokens(JSON.stringify(step.toolInput));
    } else if (typeof step.content === 'string') {
      total += roughTokens(step.content);
    }
  }
  return total;
}

/** Each agent's steps in transcript order; the main session is under `''`. */
function streamsOf(flat: Step[]): Map<string, Step[]> {
  const streams = new Map<string, Step[]>();
  for (const step of flat) {
    const id = step.agentId ?? '';
    let list = streams.get(id);
    if (!list) streams.set(id, (list = []));
    list.push(step);
  }
  return streams;
}

function responsesOf(stream: Step[]): Response[] {
  const out: Response[] = [];
  const byMessage = new Map<string, Response>();
  let segment = 0;
  let sawUser = false;

  for (const step of stream) {
    if (step.type === 'compact') {
      segment++;
      continue;
    }
    if (step.type === 'user') {
      sawUser = true;
      continue;
    }
    const id = step.messageId;
    let response = id ? byMessage.get(id) : undefined;
    if (!response && step.usage) {
      response = { head: step, steps: [], tools: [], segment, afterUser: sawUser, lastTime: time(step) };
      sawUser = false;
      out.push(response);
      if (id) byMessage.set(id, response);
    }
    if (!response) continue;
    response.steps.push(step);
    if (step.type === 'tool_call') response.tools.push(step);
    const at = time(step);
    if (Number.isFinite(at) && !(at <= response.lastTime)) response.lastTime = at;
  }
  return out;
}

/**
 * Every stream's responses, worked out once per timeline: four of the tools
 * walk them, and on a session of tens of thousands of steps the grouping is
 * most of the work.
 */
const responseCache = new WeakMap<Step[], Array<[string, Response[]]>>();

function responsesByStream(flat: Step[]): Array<[string, Response[]]> {
  let hit = responseCache.get(flat);
  if (!hit) {
    hit = [...streamsOf(flat)].map(([id, stream]) => [id, responsesOf(stream)]);
    responseCache.set(flat, hit);
  }
  return hit;
}

function parseResult(step: Step): unknown {
  const raw = step.toolResult;
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** The part of a tool's result the model actually read, as best the transcript tells. */
function visibleText(step: Step): string {
  const r: any = parseResult(step);
  if (r === undefined || r === null) return '';
  if (typeof r === 'string') return r;
  if (Array.isArray(r)) return r.map(b => (typeof b?.text === 'string' ? b.text : '')).join('\n');
  if (typeof r === 'object') {
    if (r.file && typeof r.file.content === 'string') return r.file.content;
    if ('stdout' in r || 'stderr' in r) return `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (Array.isArray(r.content)) return r.content.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join('\n');
    if (typeof r.content === 'string') return r.content;
    // Edit / Write results keep the whole file for the UI; the model gets a
    // short confirmation, so none of that counts.
    if (typeof r.filePath === 'string') return '';
    return JSON.stringify(r);
  }
  return String(r);
}

/** Whole text of a result, for matching an error message. */
function resultText(step: Step): string {
  const r: any = parseResult(step);
  if (r === undefined || r === null) return '';
  if (typeof r === 'string') return r;
  return visibleText(step) || JSON.stringify(r);
}

const firstString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      if (typeof v === 'string' && v.trim()) return v;
    }
  }
  return '';
};

const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() || path;

/** A short name for what a call did: the file, the command, the query. */
export function describeCall(step: Step): string {
  const input = step.toolInput ?? {};
  switch (step.toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      return input.file_path ? baseName(String(input.file_path)) : '';
    case 'NotebookEdit':
      return input.notebook_path ? baseName(String(input.notebook_path)) : '';
    case 'Bash':
    case 'PowerShell':
      return String(input.command ?? '').replace(/\s+/g, ' ').trim();
    case 'Grep':
    case 'Glob':
      return String(input.pattern ?? '');
    case 'Skill':
      return String(input.skill ?? input.name ?? '');
    case 'Agent':
    case 'Task':
      return String(input.description ?? input.subagent_type ?? '');
    case 'WebFetch':
      return String(input.url ?? '');
    case 'WebSearch':
    case 'ToolSearch':
      return String(input.query ?? '');
    default:
      return firstString(input).replace(/\s+/g, ' ').trim();
  }
}

// ---------------------------------------------------------------------------
// 1. Cost of each prompt
// ---------------------------------------------------------------------------

export interface TurnRow {
  /** Position in the session, 1-based; 0 for work before the first prompt. */
  order: number;
  /** The prompt's own step, to jump to. */
  globalIndex?: number;
  prompt: string;
  /** Sent by the harness or another agent rather than typed (`<agent-message …>`). */
  fromHarness: boolean;
  cost: number;
  /** Part of `cost` spent by sub-agents launched while answering it. */
  agentCost: number;
  toolCalls: number;
  agents: number;
  /** From the prompt to the main session's last step before the next one. */
  durationMs?: number;
}

export interface TurnReport {
  turns: TurnRow[];
  total: number;
  /** Sub-agents with no spawning step on record — no prompt to charge. */
  unattributed: number;
}

export function analyzeTurns(flat: Step[], subagents: Subagent[]): TurnReport {
  const byId = new Map(subagents.map(s => [s.agentId, s]));
  const rootCache = new Map<string, number | undefined>();
  // The main-session step that, through any chain of nested agents, launched
  // this one. Undefined for agents whose parent was never found.
  const rootSpawn = (agentId: string): number | undefined => {
    if (rootCache.has(agentId)) return rootCache.get(agentId);
    rootCache.set(agentId, undefined); // cycle guard
    const sub = byId.get(agentId);
    let at: number | undefined;
    if (sub) {
      at = sub.parentAgentId ? rootSpawn(sub.parentAgentId) : sub.parentStepIndex;
    }
    rootCache.set(agentId, at);
    return at;
  };

  const turns: TurnRow[] = [];
  const turnOfMain = new Map<number, TurnRow>();
  const agentsOf = new Map<TurnRow, Set<string>>();
  const startOf = new Map<TurnRow, number>();
  const endOf = new Map<TurnRow, number>();
  let current: TurnRow | undefined;

  for (const step of flat) {
    if (step.agentId) continue;
    if (step.type === 'user') {
      const text = (step.content ?? '').replace(/\s+/g, ' ').trim();
      current = {
        order: turns.length + (turns[0]?.order === 0 ? 0 : 1),
        globalIndex: key(step),
        prompt: text,
        fromHarness: /^<[\w-]+[\s>]/.test(text),
        cost: 0,
        agentCost: 0,
        toolCalls: 0,
        agents: 0,
      };
      turns.push(current);
      startOf.set(current, time(step));
    } else if (!current) {
      current = { order: 0, prompt: '', fromHarness: false, cost: 0, agentCost: 0, toolCalls: 0, agents: 0 };
      turns.push(current);
      startOf.set(current, time(step));
    }
    turnOfMain.set(step.index, current);
    const at = time(step);
    if (Number.isFinite(at)) endOf.set(current, Math.max(endOf.get(current) ?? at, at));
  }

  let total = 0;
  let unattributed = 0;
  for (const step of flat) {
    total += step.cost;
    let turn: TurnRow | undefined;
    if (!step.agentId) {
      turn = turnOfMain.get(step.index);
    } else {
      const spawn = rootSpawn(step.agentId);
      turn = spawn !== undefined ? turnOfMain.get(spawn) : undefined;
    }
    if (!turn) {
      unattributed += step.cost;
      continue;
    }
    turn.cost += step.cost;
    if (step.type === 'tool_call') turn.toolCalls++;
    if (step.agentId) {
      turn.agentCost += step.cost;
      let set = agentsOf.get(turn);
      if (!set) agentsOf.set(turn, (set = new Set()));
      set.add(step.agentId);
    }
  }

  for (const turn of turns) {
    turn.agents = agentsOf.get(turn)?.size ?? 0;
    const start = startOf.get(turn);
    const end = endOf.get(turn);
    if (start !== undefined && end !== undefined && Number.isFinite(start) && end > start) {
      turn.durationMs = end - start;
    }
  }

  return {
    // Bookkeeping before the first prompt only earns a row if it cost something.
    turns: turns.filter(t => t.order !== 0 || t.cost > 0),
    total,
    unattributed,
  };
}

// ---------------------------------------------------------------------------
// 2. Prompt cache rebuilt from scratch
// ---------------------------------------------------------------------------

export type RebuildCause = 'idle' | 'model' | 'unknown';

export interface RebuildRow {
  globalIndex: number;
  agentId?: string;
  cause: RebuildCause;
  /** Quiet time before the request. */
  gapMs: number;
  /** The cache's lifetime that applied: 5 minutes or an hour. */
  ttlMs: number;
  /** Context that was cached a request ago and had to be written again. */
  tokens: number;
  /** Writing it again instead of reading it, in dollars. */
  extraCost: number;
  fromModel?: string;
  toModel?: string;
}

/** Below this a miss is noise — a reminder that moved, a short system block. */
const REBUILD_MIN_TOKENS = 10_000;
/** Timestamps are written when a response lands, not when it was sent. */
const TTL_SLACK_MS = 60_000;

export function analyzeCacheRebuilds(flat: Step[]): RebuildRow[] {
  const rows: RebuildRow[] = [];
  for (const [agentId, responses] of responsesByStream(flat)) {
    for (let k = 1; k < responses.length; k++) {
      const prev = responses[k - 1];
      const cur = responses[k];
      // A compaction replaces the context; rewriting it is the point.
      if (cur.segment !== prev.segment) continue;

      const expected = promptSize(prev.head);
      const read = cur.head.usage?.cache_read_input_tokens ?? 0;
      const written = cur.head.usage?.cache_creation_input_tokens ?? 0;
      const lost = Math.min(expected - read, written);
      if (lost < REBUILD_MIN_TOKENS || read >= expected / 2) continue;

      const ttlMs = wrote1h(prev.head) || wrote1h(cur.head) ? 3_600_000 : 300_000;
      const gapMs = Math.max(0, time(cur.head) - prev.lastTime) || 0;
      const fromModel = prev.head.model ?? '';
      const toModel = cur.head.model ?? '';
      const cause: RebuildCause =
        normalizeModelId(fromModel) !== normalizeModelId(toModel)
          ? 'model'
          : gapMs >= ttlMs - TTL_SLACK_MS
            ? 'idle'
            : 'unknown';

      const rates = ratesOf(cur.head);
      rows.push({
        globalIndex: key(cur.head),
        agentId: agentId || undefined,
        cause,
        gapMs,
        ttlMs,
        tokens: lost,
        extraCost: lost * (writeRate(cur.head, rates) - rates.read),
        fromModel,
        toModel,
      });
    }
  }
  return rows.sort((a, b) => b.extraCost - a.extraCost);
}

// ---------------------------------------------------------------------------
// 3. Tool output that stayed in the context
// ---------------------------------------------------------------------------

export interface HeavyRow {
  globalIndex: number;
  agentId?: string;
  toolName: string;
  label: string;
  /** Growth of the next request attributed to this call, or an estimate (`measured`). */
  tokens: number;
  /** False when the transcript's counts could not isolate it and its text was sized instead. */
  measured: boolean;
  /** Later requests that sent it again before the context was compacted. */
  carried: number;
  /** Writing it once plus reading it on every later request. */
  carryCost: number;
  /** A Read with no `limit`: the whole file went in. */
  wholeFile: boolean;
}

export const HEAVY_MIN_TOKENS = 2_000;
/**
 * Real tokens per `roughTokens` on tool results — the median of measured
 * results against their text across real transcripts came out at 1.5 to 1.7.
 */
const ROUGH_TO_REAL = 1.6;
/** Most a measurement may pin on a call, as a multiple of what its text accounts for. */
const MAX_OVER_ESTIMATE = 2;
/**
 * Tools whose payload reaches the model outside the result the transcript
 * keeps: a skill's body arrives as a message of its own, a tool search as
 * schema references. Their stored result is a one-line receipt.
 */
const OUT_OF_BAND = new Set(['Skill', 'ToolSearch']);

/**
 * Share one measured growth between the calls a response made. The growth also
 * holds whatever else arrived with the results — reminders, notifications — so
 * no call is charged far beyond what its own text accounts for; what the
 * visible results cannot explain goes to a call whose payload is not visible.
 */
function split(grown: number, tools: Step[], estimates: number[]): number[] {
  const hidden = tools.map(tool => OUT_OF_BAND.has(tool.toolName ?? ''));
  const hiddenCount = hidden.filter(Boolean).length;
  if (hiddenCount > 0) {
    const known = estimates.reduce((sum, e, i) => sum + (hidden[i] ? 0 : e), 0);
    const scale = known > grown ? grown / known : 1;
    const rest = Math.max(0, grown - known * scale);
    return estimates.map((e, i) => (hidden[i] ? rest / hiddenCount : e * scale));
  }
  const weights = estimates.map(e => Math.max(1, e));
  const total = weights.reduce((x, y) => x + y, 0);
  return estimates.map((e, i) => Math.min((grown * weights[i]) / total, e * MAX_OVER_ESTIMATE));
}

/**
 * The size of a tool result is not in the transcript, but its effect is: the
 * next request is bigger than this one by this one's output plus whatever came
 * back. Measuring that difference counts what the model actually received —
 * line numbers, a loaded skill, schemas a search pulled in — where the stored
 * result can be the UI's copy (an Edit keeps the whole file) or nothing at all.
 */
export function analyzeHeavyOutputs(flat: Step[]): HeavyRow[] {
  const rows: HeavyRow[] = [];
  for (const [agentId, responses] of responsesByStream(flat)) {
    const n = responses.length;
    // later[k]: read cost per token of every response after k in its segment.
    const later = new Array<number>(n).fill(0);
    for (let k = n - 2; k >= 0; k--) {
      const next = responses[k + 1];
      later[k] =
        next.segment === responses[k].segment ? later[k + 1] + ratesOf(next.head).read : 0;
    }
    const remaining = new Array<number>(n).fill(0);
    for (let k = n - 2; k >= 0; k--) {
      remaining[k] = responses[k + 1].segment === responses[k].segment ? remaining[k + 1] + 1 : 0;
    }

    for (let k = 0; k + 1 < n; k++) {
      const a = responses[k];
      const b = responses[k + 1];
      if (a.tools.length === 0 || b.segment !== a.segment || b.afterUser) continue;
      if (normalizeModelId(a.head.model ?? '') !== normalizeModelId(b.head.model ?? '')) continue;

      // The growth holds this response's own output too, so before taking
      // that out it is an upper bound: under the threshold, no call can be over.
      const growth = promptSize(b.head) - promptSize(a.head);
      if (growth < HEAVY_MIN_TOKENS) continue;

      // Taking the output out needs its real count. One the transcript froze
      // mid-stream (and the parser then estimated) cannot isolate the results,
      // so their own text is sized instead.
      const usage = a.head.usage;
      const recorded = usage?.output_tokens ?? 0;
      const measured = !usage?.output_tokens_estimated && recorded >= roughOutput(a) / 2;
      const grown = growth - recorded;
      if (measured && grown < HEAVY_MIN_TOKENS) continue;

      const estimates = a.tools.map(tool => roughTokens(visibleText(tool)) * ROUGH_TO_REAL);
      const sizes = measured ? split(grown, a.tools, estimates) : estimates;
      const firstWrite = writeRate(b.head, ratesOf(b.head));
      // The first later request writes it; every one after that reads it.
      const reads = later[k] - ratesOf(b.head).read;

      a.tools.forEach((tool, i) => {
        const tokens = Math.round(sizes[i]);
        if (tokens < HEAVY_MIN_TOKENS) return;
        rows.push({
          globalIndex: key(tool),
          agentId: agentId || undefined,
          toolName: tool.toolName ?? '?',
          label: describeCall(tool),
          tokens,
          measured,
          carried: remaining[k],
          carryCost: tokens * (firstWrite + Math.max(0, reads)),
          wholeFile: tool.toolName === 'Read' && tool.toolInput?.limit === undefined,
        });
      });
    }
  }
  return rows.sort((x, y) => y.carryCost - x.carryCost);
}

export interface HeavyByTool {
  toolName: string;
  count: number;
  tokens: number;
  cost: number;
  /** Of `count`, Reads that took the whole file. */
  wholeFile: number;
}

export function groupHeavyByTool(rows: HeavyRow[]): HeavyByTool[] {
  const groups = new Map<string, HeavyByTool>();
  for (const row of rows) {
    let g = groups.get(row.toolName);
    if (!g) {
      groups.set(row.toolName, (g = { toolName: row.toolName, count: 0, tokens: 0, cost: 0, wholeFile: 0 }));
    }
    g.count++;
    g.tokens += row.tokens;
    g.cost += row.carryCost;
    if (row.wholeFile) g.wholeFile++;
  }
  return [...groups.values()].sort((a, b) => b.cost - a.cost);
}

/** What the session paid for its prompt cache, reads and writes together. */
export function cacheSpend(flat: Step[]): number {
  let total = 0;
  for (const [, responses] of responsesByStream(flat)) {
    for (const r of responses) {
      const b = calculateCostBreakdown(r.head.usage, r.head.model ?? '');
      total += b.cacheRead + b.cacheWrite;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// 4. Why tool calls failed
// ---------------------------------------------------------------------------

export type FailureCause =
  | 'denied'
  | 'hook'
  | 'noTool'
  | 'agentLimit'
  | 'tooLarge'
  | 'editMismatch'
  | 'staleRead'
  | 'timeout'
  | 'interrupted'
  | 'exitCode'
  | 'notFound'
  | 'other';

export interface FailureGroup {
  cause: FailureCause;
  count: number;
  tools: Record<string, number>;
  steps: number[];
  /** The first line of one of the error messages, as an example. */
  sample: string;
  /** For refusals: who refused, as the transcript records it. */
  deciders: Record<string, number>;
}

// Order matters: a command that failed because grep found no file is a
// failed command first, and a refusal mentions "not found" as often as not.
// Patterns are anchored to the harness's own wording where they can be — a
// command's output is free text, and a bare "timeout" in a stack trace is not
// the call timing out.
const FAILURE_PATTERNS: Array<[FailureCause, RegExp]> = [
  ['hook', /PreToolUse:\S* hook|hook error|^\s*(error:\s*)?blocked:/im],
  ['denied', /permission for this action|was denied|doesn't want to proceed|user rejected|tool use was rejected/i],
  ['noTool', /no such tool available|not among the tools available/i],
  ['agentLimit', /concurrent subagent limit|subagent limit reached/i],
  ['tooLarge', /exceeds maximum allowed tokens|file content \(\d+ tokens\)|too large to/i],
  ['editMismatch', /string to replace not found|found \d+ matches of the string/i],
  ['staleRead', /has not been read yet|modified since read/i],
  ['timeout', /^\s*(error:\s*)?command timed out|\btimed out after\b/im],
  ['interrupted', /interrupted by user|request interrupted/i],
  ['exitCode', /exit code \d+/i],
  ['notFound', /no such file|does not exist|not found|ENOENT|cannot find/i],
];

function sampleLine(text: string): string {
  const lines = text
    .split('\n')
    .map(l => l.replace(/^\s*error:\s*/i, '').trim())
    .filter(Boolean);
  // "Exit code 1" says nothing on its own; the line after it is the reason.
  const line = /^exit code \d+$/i.test(lines[0] ?? '') && lines[1] ? `${lines[0]} · ${lines[1]}` : lines[0] ?? '';
  return line.length > 160 ? line.slice(0, 157) + '…' : line;
}

export function analyzeFailures(flat: Step[]): FailureGroup[] {
  const groups = new Map<FailureCause, FailureGroup>();
  for (const step of flat) {
    if (step.type !== 'tool_call') continue;
    const denied = step.permission?.outcome === 'denied';
    if (step.toolSuccess !== false && !denied) continue;

    const text = resultText(step);
    const decidedBy = denied ? step.permission?.decidedBy : undefined;
    // A hook's refusal can be recorded as a rule's; the message names the hook.
    const byHook = decidedBy === 'hook' || FAILURE_PATTERNS[0][1].test(text);
    const cause: FailureCause = byHook
      ? 'hook'
      : denied
        ? 'denied'
        : FAILURE_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? 'other';

    let group = groups.get(cause);
    if (!group) {
      groups.set(cause, (group = { cause, count: 0, tools: {}, steps: [], sample: '', deciders: {} }));
    }
    group.count++;
    const tool = step.toolName ?? '?';
    group.tools[tool] = (group.tools[tool] ?? 0) + 1;
    if (cause === 'denied') {
      const who = decidedBy ?? (/auto mode classifier/i.test(text) ? 'automode' : 'unknown');
      group.deciders[who] = (group.deciders[who] ?? 0) + 1;
    }
    group.steps.push(key(step));
    if (!group.sample) group.sample = sampleLine(text);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// 5. Sub-agents by type
// ---------------------------------------------------------------------------

export interface AgentTypeRow {
  type: string;
  count: number;
  cost: number;
  avgCost: number;
  avgSteps: number;
  /** Over the agents that recorded a duration; undefined when none did. */
  avgDurationMs?: number;
  toolCalls: number;
  toolFailures: number;
  unfinished: number;
  models: string[];
  /** The most expensive agent of the type — its first step, to jump to. */
  topGlobalIndex?: number;
  topCost: number;
}

/**
 * Agents a Workflow launches are labelled per task (`review:Foo#2/5`), so each
 * would be a type of its own; they group under their prefix instead. Plugin
 * agents (`plugin:agent`) are left whole — there the part after the colon is
 * the agent.
 */
function typeKey(sub: Subagent, fallback: string): string {
  const type = sub.agentType || fallback;
  if (sub.workflowRunId && type.includes(':')) return `${type.split(':')[0]}:*`;
  return type;
}

export function analyzeAgentTypes(flat: Step[], subagents: Subagent[], fallback: string): AgentTypeRow[] {
  const perAgent = new Map<string, { cost: number; calls: number; fails: number; first?: number }>();
  for (const step of flat) {
    if (!step.agentId) continue;
    let e = perAgent.get(step.agentId);
    if (!e) perAgent.set(step.agentId, (e = { cost: 0, calls: 0, fails: 0, first: key(step) }));
    e.cost += step.cost;
    if (step.type === 'tool_call') {
      e.calls++;
      if (step.toolSuccess === false) e.fails++;
    }
  }

  const rows = new Map<string, AgentTypeRow & { durSum: number; durN: number; stepSum: number }>();
  for (const sub of subagents) {
    const k = typeKey(sub, fallback);
    let row = rows.get(k);
    if (!row) {
      rows.set(
        k,
        (row = {
          type: k,
          count: 0,
          cost: 0,
          avgCost: 0,
          avgSteps: 0,
          toolCalls: 0,
          toolFailures: 0,
          unfinished: 0,
          models: [],
          topCost: -1,
          durSum: 0,
          durN: 0,
          stepSum: 0,
        })
      );
    }
    const e = perAgent.get(sub.agentId) ?? { cost: sub.totalCost, calls: 0, fails: 0 };
    row.count++;
    row.cost += e.cost;
    row.stepSum += sub.stepCount;
    row.toolCalls += e.calls;
    row.toolFailures += e.fails;
    if (sub.finished === false) row.unfinished++;
    if (sub.durationMs && sub.durationMs > 0) {
      row.durSum += sub.durationMs;
      row.durN++;
    }
    if (sub.model && !row.models.includes(sub.model)) row.models.push(sub.model);
    if (e.cost > row.topCost) {
      row.topCost = e.cost;
      row.topGlobalIndex = e.first;
    }
  }

  return [...rows.values()]
    .map(({ durSum, durN, stepSum, ...row }) => ({
      ...row,
      avgCost: row.cost / row.count,
      avgSteps: stepSum / row.count,
      avgDurationMs: durN > 0 ? durSum / durN : undefined,
    }))
    .sort((a, b) => b.cost - a.cost);
}

// ---------------------------------------------------------------------------
// Reasoning tokens
// ---------------------------------------------------------------------------

export interface ThinkingSummary {
  thinkingTokens: number;
  outputTokens: number;
  cost: number;
}

/** Reasoning is billed as output; how much of the output it was, and what it cost. */
export function summarizeThinking(flat: Step[]): ThinkingSummary {
  let thinkingTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  for (const [, responses] of responsesByStream(flat)) {
    for (const r of responses) {
      const u = r.head.usage;
      const thinking = u?.output_tokens_details?.thinking_tokens ?? 0;
      thinkingTokens += thinking;
      outputTokens += u?.output_tokens ?? 0;
      cost += thinking * ratesOf(r.head).output;
    }
  }
  return { thinkingTokens, outputTokens, cost };
}
