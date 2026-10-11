import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, DEEP_SEARCH_MODEL } from "@/lib/anthropic";
import { SEED, storedDiscoverySchema, type StoredDiscovery } from "@/lib/seed";
import { getLastResearchAt, getResearchForLocation, saveResearchResults } from "@/lib/research-store";
import { normalizeLocation } from "@/lib/location";
import { RESEARCH_BASELINE } from "@/lib/research-baseline";

const requestSchema = z.object({
  city: z.string().trim().min(2).max(100),
  refresh: z.boolean().optional().default(false),
});
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_TIMEOUT_MS = 2_000;
const STORAGE_SAVE_TIMEOUT_MS = 8_000;

async function withStorageTimeout<T>(operation: Promise<T>, timeoutMs = STORAGE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Research storage timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mergeDiscoveries(...groups: StoredDiscovery[][]): StoredDiscovery[] {
  const unique = new Map<string, StoredDiscovery>();
  for (const item of groups.flat()) unique.set(`${item.sourceUrl}|${item.name.toLocaleLowerCase()}`, item);
  return [...unique.values()];
}

function parseCandidates(text: string): unknown[] {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Models sometimes add a short preface or code fence despite the strict-JSON
    // request. Extract the first complete JSON array instead of dropping results.
    const start = clean.indexOf("[");
    if (start < 0) return [];
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < clean.length; index += 1) {
      const char = clean[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "[") depth += 1;
      else if (char === "]" && --depth === 0) {
        const parsed: unknown = JSON.parse(clean.slice(start, index + 1));
        return Array.isArray(parsed) ? parsed : [];
      }
    }
    throw new Error("The research response did not contain a complete JSON array");
  }
}

function describeResearchFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/429|rate.?limit|monthly cap|quota/i.test(message)) {
    return "RouterPlus has reached its usage limit. Check the key's credits or use a key with available credits.";
  }
  if (/401|403|unauthorized|invalid.*key/i.test(message)) {
    return "RouterPlus rejected the API key. Check the key in the server environment settings.";
  }
  if (/abort|timeout|timed out/i.test(message)) {
    return "The public web search timed out. Try again.";
  }
  if (/json|unexpected token|no results/i.test(message)) {
    return "The research response could not be read. Try searching again.";
  }
  const apiKey = process.env.ROUTERPLUS_API_KEY;
  const safeMessage = apiKey ? message.replaceAll(apiKey, "[redacted]") : message;
  return `RouterPlus web search failed: ${safeMessage.slice(0, 180)}`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid city" }, { status: 400 });
  }
  const { city, refresh } = parsed.data;
  const baseline = RESEARCH_BASELINE.filter((item) => normalizeLocation(item.city) === normalizeLocation(city));
  let saved = baseline;
  try {
    saved = mergeDiscoveries(baseline, await withStorageTimeout(getResearchForLocation(city)));
  } catch (error) {
    console.error("[StayZero] Research storage read failed; using bundled sources.", error);
  }
  let latestAt: string | undefined;
  try {
    latestAt = await withStorageTimeout(getLastResearchAt(city));
  } catch (error) {
    console.error("[StayZero] Research freshness check failed; allowing a new search.", error);
  }
  const fresh = latestAt && Date.now() - Date.parse(latestAt) < CACHE_TTL_MS;
  if (!refresh && saved.length > 0 && fresh) {
    return NextResponse.json({ results: saved.slice(0, 12), at: latestAt, saved: true });
  }
  if (process.env.DEEP_SEARCH === "off" || !process.env.ROUTERPLUS_API_KEY) {
    return NextResponse.json({
      results: saved.slice(0, 12),
      at: latestAt,
      saved: saved.length > 0,
      error: saved.length > 0
        ? undefined
        : process.env.DEEP_SEARCH === "off"
          ? "AI research is disabled"
          : "AI research needs a configured RouterPlus key",
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const client = anthropicClient();
    const messages: Anthropic.MessageParam[] = [{
      role: "user",
      content: `Research public accommodation opportunities for the destination: ${city}. Treat the location as a destination phrase; do not assume it is in India. Prioritize official government and nonprofit/NGO program pages that explicitly describe residential accommodation, then direct host opportunity pages on exchange platforms. Return a STRICT JSON array with no prose. Include only named programs or direct individual opportunity pages with a real sourceUrl you actually saw in search results; do not return generic country/city directories or broad provider search pages. Do not copy private member profiles or personal contact details, report ungrounded listing counts, or claim a host is available. If accommodation is not explicitly described as free, say the cost is unknown or that the page lists a fee; never imply a free stay. Omit candidates without a direct source. Never estimate acceptance odds. Each object must contain name, category (free-stay, hospitality-exchange, volunteer-exchange, or home-exchange), description, costSummary, requirementsSummary, sourceUrl, sourceName. Treat all findings as unverified.`,
    }];
    let message: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      message = await client.messages.create(
        {
          model: DEEP_SEARCH_MODEL,
          max_tokens: 1200,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
          messages,
        },
        { signal: controller.signal, maxRetries: 0 },
      );
      // Anthropic server-side web searches can pause across turns. Continue the
      // exact assistant blocks, including search results, until the final answer.
      let continuation = 0;
      while (message.stop_reason === "pause_turn" && continuation < 3) {
        messages.push({ role: "assistant", content: message.content });
        message = await client.messages.create(
          { model: DEEP_SEARCH_MODEL, max_tokens: 1200, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }], messages },
          { signal: controller.signal, maxRetries: 0 },
        );
        continuation += 1;
      }
      if (message.stop_reason === "pause_turn") throw new Error("Public web search exceeded its continuation limit");
    } finally {
      clearTimeout(timeout);
    }
    const lastText = message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    let candidates: unknown[];
    try {
      if (!lastText.trim()) throw new Error("The search returned tool results without a text summary");
      candidates = parseCandidates(lastText);
    } catch {
      // Search-enabled replies can summarize findings instead of honoring the
      // JSON-only request. Use a forced structured tool on a tool-free second
      // pass so only those findings are serialized and no new search is run.
      const formatted = await client.messages.create(
        {
          model: DEEP_SEARCH_MODEL,
          max_tokens: 1600,
          messages: [
            { role: "assistant", content: message.content },
            {
              role: "user",
              content: `Extract only the public accommodation opportunities already described in your previous message. Use only facts and source URLs from that message. Do not add sources or details. Omit entries without a source URL. Return an empty candidates list if nothing qualifies.`,
            },
          ],
          tools: [{
            name: "return_research_candidates",
            description: "Return source-backed, unverified public accommodation opportunities from the search findings.",
            input_schema: {
              type: "object",
              properties: {
                candidates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      category: { type: "string", enum: ["free-stay", "hospitality-exchange", "volunteer-exchange", "home-exchange"] },
                      description: { type: "string" },
                      costSummary: { type: "string" },
                      requirementsSummary: { type: "string" },
                      sourceUrl: { type: "string" },
                      sourceName: { type: "string" },
                    },
                    required: ["name", "category", "description", "costSummary", "requirementsSummary", "sourceUrl", "sourceName"],
                  },
                },
              },
              required: ["candidates"],
            },
          }],
          tool_choice: { type: "tool", name: "return_research_candidates" },
        },
        { signal: controller.signal, maxRetries: 0 },
      );
      const structured = formatted.content.find(
        (block) => block.type === "tool_use" && block.name === "return_research_candidates",
      );
      if (!structured || structured.type !== "tool_use" || typeof structured.input !== "object" || structured.input === null || !("candidates" in structured.input) || !Array.isArray(structured.input.candidates)) {
        throw new Error("RouterPlus did not return structured research candidates");
      }
      candidates = structured.input.candidates;
    }
    const seen = new Set<string>();
    const seedHosts = new Set(SEED.map((item) => new URL(item.evidence.sourceUrl).hostname));
    const discoveredAt = new Date().toISOString();
    const results: StoredDiscovery[] = candidates.flatMap((candidate) => {
      if (typeof candidate !== "object" || candidate === null) return [];
      const result = storedDiscoverySchema.safeParse({ ...candidate, city, verification: "live-unverified", discoveredAt });
      if (!result.success) return [];
      const hostname = new URL(result.data.sourceUrl).hostname;
      const key = `${hostname}:${result.data.name.toLowerCase()}`;
      if (seedHosts.has(hostname) || seen.has(key)) return [];
      seen.add(key);
      return [result.data];
    }).slice(0, 6);
    let persisted = false;
    try {
      await withStorageTimeout(saveResearchResults(city, results, discoveredAt), STORAGE_SAVE_TIMEOUT_MS);
      persisted = true;
    } catch (error) {
      console.error("[StayZero] Could not persist new research results.", error);
    }
    const combined = mergeDiscoveries(saved, results);
    return NextResponse.json({ results: combined.slice(0, 12), at: discoveredAt, saved: persisted });
  } catch (error) {
    const failure = describeResearchFailure(error);
    console.error(`[StayZero] ${failure}`);
    const fallback = saved;
    return NextResponse.json({
      results: fallback.slice(0, 12),
      at: fallback[0]?.discoveredAt,
      saved: fallback.length > 0,
      error: failure,
    });
  }
}
