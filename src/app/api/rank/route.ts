import { NextResponse } from "next/server";
import { z } from "zod";
import { anthropicClient, RANK_MODEL } from "@/lib/anthropic";
import { heuristicRank, type RankedScore } from "@/lib/rank";
import { providerGateways } from "@/lib/provider-adapters";
import {
  CATEGORIES,
  OFFER_SKILLS,
  SEED,
  type Opportunity,
} from "@/lib/seed";
import { normalizeLocation } from "@/lib/location";

const requestSchema = z.object({
  city: z.string().trim().min(2).max(100),
  nights: z.number().int().positive().max(365),
  offers: z.array(z.enum(OFFER_SKILLS)),
  preference: z.union([z.literal("any"), z.enum(CATEGORIES)]),
});

const scoreSchema = z.object({
  scores: z.array(
    z.object({
      id: z.string(),
      fit: z.number().finite(),
      reasons: z.array(z.string()).max(3),
    }),
  ),
});

type Result = {
  opportunity: Opportunity;
  fit: number;
  reasons: string[];
  staysCapped: boolean;
};

function joinScores(
  scores: RankedScore[],
  survivors: Opportunity[],
  nights: number,
): Result[] {
  const byId = new Map(survivors.map((listing) => [listing.id, listing]));
  const used = new Set<string>();
  return scores
    .flatMap((score) => {
      const opportunity = byId.get(score.id);
      if (!opportunity || used.has(score.id)) return [];
      used.add(score.id);
      return [{
        opportunity,
        fit: Math.max(0, Math.min(100, score.fit)),
        reasons: score.reasons.slice(0, 3),
        staysCapped: Boolean(
          opportunity.stay.typicalMaxNights &&
            nights > opportunity.stay.typicalMaxNights,
        ),
      }];
    })
    .sort((a, b) => b.fit - a.fit || a.opportunity.id.localeCompare(b.opportunity.id));
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
    return NextResponse.json({ error: "Invalid search fields" }, { status: 400 });
  }

  const { city, nights, offers, preference } = parsed.data;
  const survivors = SEED.filter(
    (listing) =>
      normalizeLocation(listing.city) === normalizeLocation(city) &&
      (preference === "any" || listing.category === preference) &&
      nights >= (listing.stay.minCommitmentNights ?? 0),
  );
  const fallbackScores = heuristicRank(survivors, offers);
  const gateways = providerGateways(city, offers, preference, nights);
  const fallback = () => NextResponse.json({
    ranked: "heuristic" as const,
    results: joinScores(fallbackScores, survivors, nights),
    gateways,
    deepSearchEnabled: process.env.DEEP_SEARCH !== "off" && Boolean(process.env.ROUTERPLUS_API_KEY),
  });

  if (!process.env.ROUTERPLUS_API_KEY || survivors.length === 0) return fallback();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let message;
    try {
      message = await anthropicClient().messages.create(
        {
          model: RANK_MODEL,
          max_tokens: 1500,
          system: "You score accommodation opportunities for fit against what a traveller offers. You may ONLY score the listings provided, referenced by id. Never add, rename, or invent listings. Reasons must cite the traveller's stated offer or the listing's stated requirements — never invent facts, availability, or acceptance odds.",
          messages: [{
            role: "user",
            content: JSON.stringify({
              traveller: { nights, offers, preference },
              listings: survivors.map((listing) => ({
                id: listing.id,
                category: listing.category,
                kind: listing.kind,
                description: listing.description,
                requirements: listing.requirements,
                stay: listing.stay,
                cost: listing.cost,
              })),
            }),
          }],
          tools: [{
            name: "score_listings",
            description: "Score each listing by id",
            input_schema: {
              type: "object",
              properties: {
                scores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      fit: { type: "number" },
                      reasons: { type: "array", items: { type: "string" }, maxItems: 3 },
                    },
                    required: ["id", "fit", "reasons"],
                  },
                },
              },
              required: ["scores"],
            },
          }],
          tool_choice: { type: "tool", name: "score_listings" },
        },
        { signal: controller.signal, maxRetries: 0 },
      );
    } finally {
      clearTimeout(timeout);
    }
    const tool = message.content.find(
      (block) => block.type === "tool_use" && block.name === "score_listings",
    );
    if (!tool || tool.type !== "tool_use") return fallback();
    const scores = scoreSchema.parse(tool.input).scores;
    const joined = joinScores(scores, survivors, nights);
    if (joined.length === 0) return fallback();
    const scoredIds = new Set(joined.map((result) => result.opportunity.id));
    const remaining = joinScores(
      fallbackScores.filter((score) => !scoredIds.has(score.id)),
      survivors,
      nights,
    );
    return NextResponse.json({
      ranked: "llm",
      results: [...joined, ...remaining].sort((a, b) => b.fit - a.fit),
      gateways,
      deepSearchEnabled: process.env.DEEP_SEARCH !== "off" && Boolean(process.env.ROUTERPLUS_API_KEY),
    });
  } catch {
    return fallback();
  }
}
