import type { StoredDiscovery } from "@/lib/seed";

export function LiveResultCard({ result }: { result: StoredDiscovery }) {
  return (
    <article className="live-card">
      <span className="live-badge">Unverified candidate · check the source</span>
      <h3>{result.name}</h3>
      <p className="muted-small">Saved {new Date(result.discoveredAt).toLocaleDateString()}</p>
      <p>{result.description}</p>
      <dl>
        <div><dt>Cost</dt><dd>{result.costSummary}</dd></div>
        <div><dt>Requirements</dt><dd>{result.requirementsSummary}</dd></div>
      </dl>
      <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer">View source ({result.sourceName}) ↗</a>
    </article>
  );
}
