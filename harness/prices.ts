/**
 * List prices in USD per million tokens, as published on 2026-09-24:
 *   Anthropic: https://platform.claude.com/docs/en/about-claude/pricing (cache write = 1-hour cache)
 *   OpenAI:    https://developers.openai.com/api/docs/pricing (standard processing, short context)
 * Cost is computed from each run's token counts with these prices, for every model alike. Claude
 * Code's own cost figure is kept alongside as a cross-check.
 */
import type { Usage } from "./agents.js";

export interface Price {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

export const PRICES: Record<string, Price> = {
  // Claude Code writes its prompt cache with the one-hour TTL.
  "claude-opus-5-5": { input: 4, cacheRead: 0.2, cacheWrite: 8, output: 20 },
  "gpt-6-astra": { input: 10, cacheRead: 1, cacheWrite: 10, output: 50 },
  "gpt-6-sol": { input: 2, cacheRead: 0.2, cacheWrite: 2, output: 10 },
  "gpt-6-luna": { input: 0.1, cacheRead: 0.01, cacheWrite: 0.1, output: 0.5 },
};

export function costUsd(model: string, u: Usage): number {
  const p = PRICES[model];
  if (!p) throw new Error(`no price for ${model}`);
  return (u.input * p.input + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite + u.output * p.output) / 1e6;
}
