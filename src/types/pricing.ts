// Single source of truth for token pricing, shared by the extension host and
// the webview. Deliberately dependency-free so both builds can import it.
//
// Transcripts record token counts and a model id, never a price — every figure
// Argus shows is computed here.

export interface CostUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  // Cache writes are billed per TTL: 5-minute entries cost 1.25x the base input
  // rate, 1-hour entries 2x. Without this split the flat
  // `cache_creation_input_tokens` cannot be priced correctly.
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  // Fast mode runs the same model at premium pricing.
  speed?: string;
}

// Every rate in this file is in US dollars per million tokens — Anthropic's
// API list prices. A Claude subscription (Pro / Max) is not billed per token,
// so for those users the figures are the API-equivalent cost of the session.
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  // Cache reads cost CACHE_READ_RATIO x input on most models. Newer ones
  // discount deeper (Fable 5.1 at 0.025x, Opus 5.5 at 0.05x), so a model can
  // carry its own list price; fast mode scales it by the same ratio.
  cacheReadPerMillion?: number;
  // Fast mode (Opus-tier only) bills the same model at a premium rate.
  fastInputPerMillion?: number;
  fastOutputPerMillion?: number;
}

// Ratios applied to the model's base input rate, unless the model lists its
// own cache-read price. Cache writes are the same multiple on every model.
export const CACHE_READ_RATIO = 0.1;
export const CACHE_WRITE_5M_RATIO = 1.25;
export const CACHE_WRITE_1H_RATIO = 2.0;

export const MODEL_PRICES: Record<string, ModelPricing> = {
  'claude-fable-5-1': { inputPerMillion: 10.0, outputPerMillion: 50.0, cacheReadPerMillion: 0.25 },
  // Whether Mythos 5.1 shares Fable 5.1's $0.25 cache reads was left open at
  // launch; until it is confirmed it is priced at the standard 0.1x.
  'claude-mythos-5-1': { inputPerMillion: 10.0, outputPerMillion: 50.0 },
  'claude-fable-5': { inputPerMillion: 10.0, outputPerMillion: 50.0 },
  'claude-mythos-5': { inputPerMillion: 10.0, outputPerMillion: 50.0 },
  'claude-opus-5-5': {
    inputPerMillion: 4.0,
    outputPerMillion: 20.0,
    cacheReadPerMillion: 0.2,
    fastInputPerMillion: 8.0,
    fastOutputPerMillion: 40.0,
  },
  'claude-opus-5': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    fastInputPerMillion: 10.0,
    fastOutputPerMillion: 50.0,
  },
  'claude-opus-4-8': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    fastInputPerMillion: 10.0,
    fastOutputPerMillion: 50.0,
  },
  'claude-opus-4-7': { inputPerMillion: 5.0, outputPerMillion: 25.0 },
  'claude-opus-4-6': { inputPerMillion: 5.0, outputPerMillion: 25.0 },
  'claude-sonnet-5': { inputPerMillion: 2.0, outputPerMillion: 10.0 },
  'claude-sonnet-4-6': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-sonnet-4-5-20250929': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-haiku-4-5': { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  'claude-haiku-4-5-20251001': { inputPerMillion: 1.0, outputPerMillion: 5.0 },
};

// Family rates for model ids released after this table was written. Priced as
// the cheapest current member of the family, so a new model is never billed as
// something from a different tier.
const FAMILY_FALLBACKS: Array<{ name: string; match: RegExp; pricing: ModelPricing }> = [
  { name: 'fable', match: /fable|mythos/i, pricing: { inputPerMillion: 10.0, outputPerMillion: 50.0 } },
  { name: 'opus', match: /opus/i, pricing: { inputPerMillion: 4.0, outputPerMillion: 20.0 } },
  { name: 'sonnet', match: /sonnet/i, pricing: { inputPerMillion: 2.0, outputPerMillion: 10.0 } },
  { name: 'haiku', match: /haiku/i, pricing: { inputPerMillion: 1.0, outputPerMillion: 5.0 } },
];

const UNKNOWN_MODEL_PRICING: ModelPricing = {
  inputPerMillion: 3.0,
  outputPerMillion: 15.0,
};

// Claude Code writes its own placeholder turns ("No response requested.",
// spend-limit notices) as assistant messages with this model and all-zero
// usage. Nothing is billed for them, and they are not an unknown model.
export const SYNTHETIC_MODEL = '<synthetic>';

export interface ResolvedPricing extends ModelPricing {
  // True when the id was not matched, so every cost derived from it is an
  // estimate. The UI marks such figures rather than presenting them as fact.
  isFallback: boolean;
  // Which family's rates stood in for an unmatched id — `undefined` when none
  // matched either and the generic default was used.
  fallbackFamily?: string;
}

/**
 * The id to look a price up by. Routing decorations around the public id —
 * a context-size tag (`claude-opus-5[1m]`) or a dated snapshot suffix
 * (`claude-sonnet-4-5-20250929`, Vertex `@20250929`) — name the same model.
 */
export function normalizeModelId(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/\[[^\]]*\]$/, '')
    .replace(/[-@]\d{8}$/, '');
}

export function getModelPricing(model: string): ResolvedPricing {
  if (model === SYNTHETIC_MODEL) {
    return { inputPerMillion: 0, outputPerMillion: 0, isFallback: false };
  }

  const exact = MODEL_PRICES[model] ?? MODEL_PRICES[normalizeModelId(model)];
  if (exact) {
    return { ...exact, isFallback: false };
  }

  if (model) {
    const family = FAMILY_FALLBACKS.find(f => f.match.test(model));
    if (family) {
      return { ...family.pricing, isFallback: true, fallbackFamily: family.name };
    }
  }

  return { ...UNKNOWN_MODEL_PRICING, isFallback: true };
}

/** Effective cache-read rate per million tokens, at the given input rate. */
export function cacheReadRate(pricing: ModelPricing, inRate: number): number {
  const ratio =
    pricing.cacheReadPerMillion !== undefined && pricing.inputPerMillion > 0
      ? pricing.cacheReadPerMillion / pricing.inputPerMillion
      : CACHE_READ_RATIO;
  return inRate * ratio;
}

/** True when a response actually consumed tokens — only those can be mispriced. */
export function hasBilledTokens(usage: CostUsage | undefined): boolean {
  if (!usage) return false;
  return (
    (usage.input_tokens ?? 0) +
      (usage.output_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) >
    0
  );
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/**
 * Price one API response. Callers must invoke this once per `message.id` —
 * a response is written to the transcript as one event per content block, each
 * repeating the same usage, so pricing every event inflates the total.
 */
export function calculateCostBreakdown(
  usage: CostUsage | undefined,
  model: string
): CostBreakdown {
  if (!usage) {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  }

  const pricing = getModelPricing(model);
  const isFast = usage.speed === 'fast';
  const inRate =
    isFast && pricing.fastInputPerMillion !== undefined
      ? pricing.fastInputPerMillion
      : pricing.inputPerMillion;
  const outRate =
    isFast && pricing.fastOutputPerMillion !== undefined
      ? pricing.fastOutputPerMillion
      : pricing.outputPerMillion;

  // Prefer the per-TTL breakdown; fall back to the flat counter (older
  // transcripts omit `cache_creation`), treating it as 5-minute writes.
  const write5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const flatWrite =
    write5m + write1h === 0 ? usage.cache_creation_input_tokens ?? 0 : 0;

  const input = ((usage.input_tokens ?? 0) * inRate) / 1_000_000;
  const output = ((usage.output_tokens ?? 0) * outRate) / 1_000_000;
  const cacheRead =
    ((usage.cache_read_input_tokens ?? 0) * cacheReadRate(pricing, inRate)) / 1_000_000;
  const cacheWrite =
    ((write5m + flatWrite) * inRate * CACHE_WRITE_5M_RATIO +
      write1h * inRate * CACHE_WRITE_1H_RATIO) /
    1_000_000;

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  };
}

export function calculateCost(usage: CostUsage | undefined, model: string): number {
  return calculateCostBreakdown(usage, model).total;
}
