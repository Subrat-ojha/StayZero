import Anthropic from "@anthropic-ai/sdk";

// RouterPlus exposes an Anthropic-compatible API. Models available on this
// key: claude-sonnet-5-5, claude-haiku-5-5 (verified via /v1/models).
export const RANK_MODEL = "claude-haiku-5-5";
export const DEEP_SEARCH_MODEL = "claude-sonnet-5-5";

export function anthropicClient(): Anthropic {
  const apiKey = process.env.ROUTERPLUS_API_KEY;
  if (!apiKey) throw new Error("ROUTERPLUS_API_KEY is not set");
  return new Anthropic({
    apiKey,
    baseURL: process.env.ROUTERPLUS_BASE_URL ?? "https://api.routerplus.com",
  });
}
