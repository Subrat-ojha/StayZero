import { NextResponse } from "next/server";
import { z } from "zod";
import { anthropicClient, DEEP_SEARCH_MODEL } from "@/lib/anthropic";
import { SEED, storedDiscoverySchema, type StoredDiscovery } from "@/lib/seed";
import { getLastResearchAt, getResearchForLocation, saveResearchResults } from "@/lib/research-store";

const requestSchema = z.object({
  city: z.string().trim().min(2).max(100),
  refresh: z.boolean().optional().default(false),
});
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function parseCandidates(text: string): unknown[] {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(clean);
  return Array.isArray(parsed) ? parsed : [];
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
  const saved = await getResearchForLocation(city);
  const latestAt = await getLastResearchAt(city) ?? saved[0]?.discoveredAt;
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
    let message;
    try {
      message = await anthropicClient().messages.create(
        {
          model: DEEP_SEARCH_MODEL,
          max_tokens: 2000,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
          messages: [{
            role: "user",
          content: `Research public accommodation opportunities for the destination: ${city}. Treat the location as a destination phrase; do not assume it is in India. Search for free, donation-based, hospitality-exchange, volunteer-exchange, or home-exchange options. Return a STRICT JSON array with no prose. Include only public programs or opportunity pages with a real sourceUrl you actually saw in search results. Do not copy private member profiles, personal contact details, or claim a host is available. Omit candidates without sources. Never estimate acceptance odds. Each object must contain name, category (free-stay, hospitality-exchange, volunteer-exchange, or home-exchange), description, costSummary, requirementsSummary, sourceUrl, sourceName. Treat all findings as unverified.`,
          }],
        },
        { signal: controller.signal, maxRetries: 0 },
      );
    } finally {
      clearTimeout(timeout);
    }
    const textBlocks = message.content.filter((block) => block.type === "text");
    const lastText = textBlocks.at(-1)?.text;
    if (!lastText) throw new Error("No results");
    const seen = new Set<string>();
    const seedHosts = new Set(SEED.map((item) => new URL(item.evidence.sourceUrl).hostname));
    const discoveredAt = new Date().toISOString();
    const results: StoredDiscovery[] = parseCandidates(lastText).flatMap((candidate) => {
      if (typeof candidate !== "object" || candidate === null) return [];
      const result = storedDiscoverySchema.safeParse({ ...candidate, city, verification: "live-unverified", discoveredAt });
      if (!result.success) return [];
      const hostname = new URL(result.data.sourceUrl).hostname;
      const key = `${hostname}:${result.data.name.toLowerCase()}`;
      if (seedHosts.has(hostname) || seen.has(key)) return [];
      seen.add(key);
      return [result.data];
    }).slice(0, 6);
    await saveResearchResults(city, results, discoveredAt);
    const combined = await getResearchForLocation(city);
    return NextResponse.json({ results: combined.slice(0, 12), at: discoveredAt, saved: true });
  } catch (error) {
    const failure = describeResearchFailure(error);
    console.error(`[StayZero] ${failure}`);
    const fallback = await getResearchForLocation(city).catch(() => []);
    return NextResponse.json({
      results: fallback.slice(0, 12),
      at: fallback[0]?.discoveredAt,
      saved: fallback.length > 0,
      error: failure,
    });
  }
}
