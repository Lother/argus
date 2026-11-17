// How to count tokens without counting them twice. Dependency-free so the
// extension host and the webview can share one implementation, same as
// pricing.ts.
//
// The transcript writes one JSONL event per content block of an API response,
// and every one of them repeats that response's `usage`. A step is built per
// block, so a response with a thinking block and two tool calls yields three
// steps all carrying the same counts. Summing `usage` across steps therefore
// multiplies the totals by the block count — measured at 2.0x for input and
// 1.7x for output on a real corpus.

/**
 * Minimal shape the de-duplication needs. Both the host's `Step` and the
 * webview's satisfy it structurally, so neither has to be imported here.
 */
interface ResponseStep {
  index: number;
  messageId?: string;
  usage?: unknown;
}

/**
 * The steps that carry usage, one per API response: for each `messageId` the
 * first step that has it, in order. Iterate this instead of `steps` whenever
 * `usage` is being summed or averaged.
 *
 * Costs do not need it — the parser already charges a response once and gives
 * its siblings `cost: 0` — but every raw token count does.
 *
 * A step without a `messageId` is kept as-is rather than grouped: ids are
 * absent only where there is nothing to group by, and collapsing them all into
 * one bucket would drop real usage.
 */
export function oncePerResponse<T extends ResponseStep>(steps: T[]): T[] {
  const seen = new Set<string>();
  const responses: T[] = [];

  for (const step of steps) {
    if (!step.usage) {
      continue;
    }
    if (!step.messageId) {
      responses.push(step);
      continue;
    }
    if (seen.has(step.messageId)) {
      continue;
    }
    seen.add(step.messageId);
    responses.push(step);
  }

  return responses;
}

// ---------------------------------------------------------------------------
// Output counts frozen mid-stream
// ---------------------------------------------------------------------------
//
// Every event of a response repeats its `usage`, and the parser prices the last
// one because `output_tokens` grows as the response streams. Sub-agent
// transcripts break that: most of their responses are written with
// `stop_reason: null` on every event, carrying the count from the moment the
// stream opened — 4 tokens for a Write of 16,000 characters. Measured across
// 45 days of transcripts: 51% of sub-agent responses look like this (none in
// main sessions), and they record 3% of what their content needs. Nothing later
// in the transcript has the real figure, so for those responses the output is
// sized from what they visibly wrote instead.

/**
 * Real output tokens per `roughTokens` of visible output (text, tool inputs),
 * reasoning included. Calibrated on responses that did record a final count,
 * shaped like the frozen ones — 91% of those are a single tool call, and
 * single-call responses came out at 3.18 (main sessions) and 3.24 (sub-agents).
 * Responses with text run lower (1.7–2.9), so a few are overstated; the total
 * is what this is for.
 */
export const OUTPUT_PER_ROUGH_TOKEN = 3;
/** Share of that output that was reasoning, on the same responses (0.36–0.39). */
export const ESTIMATED_THINKING_SHARE = 0.38;

/**
 * Rough token count of a piece of text: CJK runs close to a token per
 * character, ASCII nearer three to four characters per token. Long text is
 * sampled — only the share of wide characters matters, and a big session runs
 * tens of millions of characters through here.
 */
export function roughTokens(text: string): number {
  const n = text.length;
  if (n === 0) return 0;
  const stride = n > 16_384 ? 8 : 1;
  let seen = 0;
  let wide = 0;
  for (let i = 0; i < n; i += stride) {
    seen++;
    if (text.charCodeAt(i) >= 128) wide++;
  }
  const other = (wide / seen) * n;
  return (n - other) / 3.5 + other;
}

/** Rough size of what one event's content blocks wrote: text, reasoning, tool inputs. */
export function roughOutputOf(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: string; text?: unknown; thinking?: unknown; input?: unknown };
    if (b.type === 'text' && typeof b.text === 'string') total += roughTokens(b.text);
    else if (b.type === 'thinking' && typeof b.thinking === 'string') total += roughTokens(b.thinking);
    else if (b.type === 'tool_use' && b.input !== undefined) total += roughTokens(JSON.stringify(b.input));
  }
  return total;
}

interface OutputUsage {
  output_tokens: number;
  output_tokens_details?: { thinking_tokens?: number };
  /** Set by `settleOutputTokens` when the count below is an estimate. */
  output_tokens_estimated?: boolean;
}

/**
 * A response's usage with a mid-stream output count replaced by an estimate.
 *
 * `snapshot` is whether the response's last event still had `stop_reason:
 * null`. Transcripts too old to have the field leave it `undefined` and are
 * trusted as written. The estimate only ever raises the count — a snapshot
 * that already holds more is kept.
 */
export function settleOutputTokens<U extends OutputUsage>(usage: U, roughOutput: number, snapshot: boolean): U {
  if (!snapshot) return usage;
  const estimate = Math.round(roughOutput * OUTPUT_PER_ROUGH_TOKEN);
  if (estimate <= (usage.output_tokens ?? 0)) return usage;
  return {
    ...usage,
    output_tokens: estimate,
    output_tokens_details: {
      ...usage.output_tokens_details,
      thinking_tokens: Math.round(estimate * ESTIMATED_THINKING_SHARE),
    },
    output_tokens_estimated: true,
  };
}
