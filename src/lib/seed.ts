import { z } from "zod";

export const CITIES = ["hyderabad", "bangalore"] as const;
// These are autocomplete suggestions, not a closed set of supported locations.
export type City = string;

export const CATEGORIES = [
  "free-stay",
  "hospitality-exchange",
  "volunteer-exchange",
  "home-exchange",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const OFFER_SKILLS = [
  "web-development",
  "graphic-design",
  "social-media",
  "teaching",
  "hands-on-help",
] as const;
export type OfferSkill = (typeof OFFER_SKILLS)[number];

const extraSchema = z.object({
  label: z.string(),
  amountINR: z.number().nonnegative(),
  per: z.enum(["night", "stay", "year"]),
});

export const opportunitySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(3),
  category: z.enum(CATEGORIES),
  city: z.string().trim().min(2).max(100),
  area: z.string().optional(),
  kind: z.enum(["place", "platform-gateway"]),
  description: z.string().min(20),
  cost: z.object({
    nightlyINR: z.literal(0),
    mandatoryExtras: z.array(extraSchema),
    donationExpected: z.boolean(),
    notes: z.string().optional(),
  }),
  stay: z.object({
    typicalMaxNights: z.number().positive().optional(),
    minCommitmentNights: z.number().positive().optional(),
  }),
  requirements: z.object({
    skills: z.array(z.enum(OFFER_SKILLS)),
    hoursPerDay: z.number().positive().optional(),
    idRequired: z.boolean(),
    referencesHelp: z.boolean(),
    rules: z.array(z.string()).optional(),
  }),
  evidence: z.object({
    sourceUrl: z.string().url(),
    sourceName: z.string(),
    retrievedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    verification: z.literal("curated-human"),
    verificationNote: z.string().min(10),
  }),
  safety: z.array(z.string()).min(1),
  howToSecure: z.string().min(10),
});

export type Opportunity = z.infer<typeof opportunitySchema>;

// Live deep-search results are a deliberately separate type: they can never
// carry the "curated-human" verification value, so the verified badge cannot
// render on them.
export const liveResultSchema = z.object({
  name: z.string().min(3),
  category: z.enum(CATEGORIES),
  city: z.string().trim().min(2).max(100),
  description: z.string().min(10),
  costSummary: z.string(),
  requirementsSummary: z.string(),
  sourceUrl: z.string().url(),
  sourceName: z.string(),
  verification: z.literal("live-unverified"),
});
export type LiveResult = z.infer<typeof liveResultSchema>;

export const storedDiscoverySchema = liveResultSchema.extend({
  discoveredAt: z.string().datetime(),
});
export type StoredDiscovery = z.infer<typeof storedDiscoverySchema>;

// Human-reviewed records go here. Candidate URLs in SEED_REVIEW.md are not curated records.
export const SEED: Opportunity[] = [];

export function validateSeed(): string[] {
  const errors: string[] = [];
  if (SEED.length < 12) errors.push(`only ${SEED.length} curated records; minimum is 12`);
  if (SEED.filter((record) => ["bangalore", "bengaluru"].includes(record.city.toLowerCase().split(",")[0].trim())).length < 8) errors.push("Bangalore needs at least 8 curated records");
  if (SEED.filter((record) => record.city.toLowerCase().split(",")[0].trim() === "hyderabad").length < 4) errors.push("Hyderabad needs at least 4 curated records");
  const ids = new Set<string>();
  for (const record of SEED) {
    const parsed = opportunitySchema.safeParse(record);
    if (!parsed.success) {
      errors.push(`${record.id}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    }
    if (ids.has(record.id)) errors.push(`duplicate id: ${record.id}`);
    if ((URL.canParse(record.evidence.sourceUrl) && new URL(record.evidence.sourceUrl).hostname === "example.com") || record.name.includes("PLACEHOLDER") || record.evidence.verificationNote.includes("NOT YET VERIFIED")) {
      errors.push(`${record.id}: placeholder source or verification note`);
    }
    ids.add(record.id);
  }
  return errors;
}
