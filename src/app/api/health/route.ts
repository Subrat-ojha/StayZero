import { connection, NextResponse } from "next/server";
import { anthropicClient, RANK_MODEL, DEEP_SEARCH_MODEL } from "@/lib/anthropic";
import { validateSeed } from "@/lib/seed";

// Smoke test: one cheap haiku call and one sonnet call with the web_search
// server tool, to confirm both work through the RouterPlus proxy.
export async function GET() {
  await connection();
  const result: Record<string, unknown> = { seedErrors: validateSeed() };
  if (!process.env.ROUTERPLUS_API_KEY) {
    return NextResponse.json({ ...result, haiku: "SKIPPED: no API key", webSearch: "SKIPPED: no API key" });
  }
  const client = anthropicClient();

  try {
    const ping = await client.messages.create({
      model: RANK_MODEL,
      max_tokens: 20,
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
    });
    result.haiku = ping.content[0]?.type === "text" ? ping.content[0].text : "non-text";
  } catch (e) {
    result.haiku = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const search = await client.messages.create({
      model: DEEP_SEARCH_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: "Use web search once to find the official BeWelcome website URL. Reply with just the URL.",
        },
      ],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
    });
    result.webSearch = search.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join(" ")
      .slice(0, 200);
    result.webSearchStop = search.stop_reason;
  } catch (e) {
    result.webSearch = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json(result);
}
