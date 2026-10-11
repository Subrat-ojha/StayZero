import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { getStore } from "@netlify/blobs";
import { normalizeLocation } from "@/lib/location";
import { storedDiscoverySchema, type StoredDiscovery } from "@/lib/seed";
import { RESEARCH_BASELINE } from "@/lib/research-baseline";

const DATA_FILE = join(process.cwd(), "data", "researched-stays.json");
const MAX_SAVED_RESULTS = 5_000;
let writeQueue: Promise<unknown> = Promise.resolve();

type ResearchDataset = { results: StoredDiscovery[]; lastSearchedAt: Record<string, string> };
type LocationDataset = { results: StoredDiscovery[]; lastSearchedAt?: string };

function shouldUseNetlifyBlobs(): boolean {
  return process.env.STAYZERO_STORAGE === "netlify-blobs" ||
    process.env.NETLIFY === "true" ||
    Boolean(process.env.NETLIFY_SITE_ID);
}
function netlifyBlobKey(destination: string): string {
  const digest = createHash("sha256").update(normalizeLocation(destination)).digest("hex");
  return `destination-${digest}`;
}

function parseLocationDataset(value: unknown): LocationDataset {
  if (typeof value !== "object" || value === null || !("results" in value) || !Array.isArray(value.results)) {
    return { results: [] };
  }
  const record = value as { results: unknown[]; lastSearchedAt?: unknown };
  return {
    results: record.results.map((item) => storedDiscoverySchema.parse(item)),
    lastSearchedAt: typeof record.lastSearchedAt === "string" ? record.lastSearchedAt : undefined,
  };
}

async function readNetlifyLocation(destination: string): Promise<LocationDataset> {
  const store = getStore({ name: "stayzero-research", consistency: "strong" });
  const saved = await store.get(netlifyBlobKey(destination), { type: "json", consistency: "strong" });
  return saved === null ? { results: [] } : parseLocationDataset(saved);
}

async function readResearchDataset(): Promise<ResearchDataset> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const data: unknown = JSON.parse(raw);
    // Accept the original prototype array format so existing local results survive upgrade.
    if (Array.isArray(data)) return { results: data.map((item) => storedDiscoverySchema.parse(item)), lastSearchedAt: {} };
    if (typeof data !== "object" || data === null || !("results" in data) || !Array.isArray(data.results)) {
      throw new Error("Research dataset must contain a results array");
    }
    const record = data as { results: unknown[]; lastSearchedAt?: unknown };
    const lastSearchedAt = typeof record.lastSearchedAt === "object" && record.lastSearchedAt !== null
      ? Object.fromEntries(Object.entries(record.lastSearchedAt).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {};
    return { results: record.results.map((item) => storedDiscoverySchema.parse(item)), lastSearchedAt };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { results: [], lastSearchedAt: {} };
    throw error;
  }
}

export async function getResearchForLocation(destination: string): Promise<StoredDiscovery[]> {
  const key = normalizeLocation(destination);
  const baseline = RESEARCH_BASELINE.filter((item) => normalizeLocation(item.city) === key);
  if (shouldUseNetlifyBlobs()) {
    const dataset = await readNetlifyLocation(destination);
    return mergeResults(baseline, dataset.results).sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
  }
  const dataset = await readResearchDataset();
  const saved = dataset.results.filter((item) => normalizeLocation(item.city) === key);
  return mergeResults(baseline, saved)
    .sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
}

export async function getLastResearchAt(destination: string): Promise<string | undefined> {
  if (shouldUseNetlifyBlobs()) return (await readNetlifyLocation(destination)).lastSearchedAt;
  const dataset = await readResearchDataset();
  return dataset.lastSearchedAt[normalizeLocation(destination)];
}

export function saveResearchResults(destination: string, results: StoredDiscovery[], searchedAt: string): Promise<void> {
  const operation = writeQueue.then(async () => {
    if (shouldUseNetlifyBlobs()) {
      const dataset = await readNetlifyLocation(destination);
      const next = mergeResults(dataset.results, results);
      const store = getStore({ name: "stayzero-research", consistency: "strong" });
      await store.setJSON(netlifyBlobKey(destination), { results: next.slice(-MAX_SAVED_RESULTS), lastSearchedAt: searchedAt });
      return;
    }
    const dataset = await readResearchDataset();
    const all = dataset.results;
    const merged = mergeResults(all, results);
    const next: ResearchDataset = {
      results: merged.slice(-MAX_SAVED_RESULTS),
      lastSearchedAt: { ...dataset.lastSearchedAt, [normalizeLocation(destination)]: searchedAt },
    };
    const directory = join(process.cwd(), "data");
    const temporaryFile = `${DATA_FILE}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporaryFile, DATA_FILE);
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

function mergeResults(existing: StoredDiscovery[], incoming: StoredDiscovery[]): StoredDiscovery[] {
  const merged = [...existing];
  const indexes = new Map(merged.map((item, index) => [`${normalizeLocation(item.city)}|${item.sourceUrl}|${item.name.toLocaleLowerCase()}`, index]));
  for (const result of incoming) {
    const key = `${normalizeLocation(result.city)}|${result.sourceUrl}|${result.name.toLocaleLowerCase()}`;
    const priorIndex = indexes.get(key);
    if (priorIndex === undefined) {
      indexes.set(key, merged.length);
      merged.push(storedDiscoverySchema.parse(result));
    } else {
      merged[priorIndex] = storedDiscoverySchema.parse(result);
    }
  }
  return merged;
}
