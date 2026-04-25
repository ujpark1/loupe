import type Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODEL, anthropic } from "@/lib/clients";
import { extractJson } from "@/lib/extract-json";

export type ThinkingOpts = {
  enabled: true;
  budgetTokens: number;
} | { enabled: false };

export type ClaudeJsonRequest = {
  system: string;
  user: string;
  maxTokens: number;
  thinking?: ThinkingOpts;
  // Optional override; almost always leave undefined to use ANTHROPIC_MODEL.
  model?: string;
  // Where to log raw text on parse failure (defaults to console.error).
  onParseError?: (raw: string, err: Error) => void;
};

/**
 * Concat all top-level "text" content blocks. Skips thinking / redacted-thinking blocks.
 */
export function collectText(message: Anthropic.Messages.Message): string {
  const out: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") out.push(block.text);
  }
  return out.join("\n").trim();
}

/**
 * Send a single-turn message to Claude and parse the response as JSON.
 *
 * - Uses ANTHROPIC_MODEL by default (Sonnet 4.6).
 * - When `thinking.enabled` is true, passes `thinking: { type: "enabled", budget_tokens }`.
 *   Note: when extended thinking is on, the API requires `temperature` to default; we
 *   omit temperature in that path to avoid invalid-request errors.
 * - On non-JSON output, throws with the raw text attached.
 */
export async function claudeJson<T = unknown>(req: ClaudeJsonRequest): Promise<{
  parsed: T;
  raw: string;
  usage: Anthropic.Messages.Usage;
}> {
  const client = anthropic();
  const model = req.model ?? ANTHROPIC_MODEL;

  const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
  };

  if (req.thinking && req.thinking.enabled) {
    params.thinking = {
      type: "enabled",
      budget_tokens: req.thinking.budgetTokens,
    };
    // Extended thinking requires temperature=1 (the default). Don't set it.
  }

  const message = await client.messages.create(params);
  const raw = collectText(message);

  let parsed: T;
  try {
    parsed = extractJson<T>(raw);
  } catch (err) {
    const e = err as Error;
    if (req.onParseError) req.onParseError(raw, e);
    else
      console.error("[claudeJson] failed to parse JSON. raw text follows:\n", raw);
    throw err;
  }

  return { parsed, raw, usage: message.usage };
}

/**
 * Plain-text variant — returns the joined text content with no JSON parsing.
 * Useful when you want to do something custom with the model output.
 */
export async function claudeText(req: Omit<ClaudeJsonRequest, "onParseError">): Promise<{
  text: string;
  usage: Anthropic.Messages.Usage;
}> {
  const client = anthropic();
  const model = req.model ?? ANTHROPIC_MODEL;
  const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
  };
  if (req.thinking && req.thinking.enabled) {
    params.thinking = {
      type: "enabled",
      budget_tokens: req.thinking.budgetTokens,
    };
  }
  const message = await client.messages.create(params);
  return { text: collectText(message), usage: message.usage };
}
