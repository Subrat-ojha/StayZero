import type { ProviderGateway } from "@/lib/provider-adapters";

const CATEGORY_LABELS: Record<ProviderGateway["category"], string> = {
  "free-stay": "Free or donation stay",
  "hospitality-exchange": "Hospitality exchange",
  "volunteer-exchange": "Volunteer exchange",
  "home-exchange": "Home exchange",
};

export function ProviderGatewayCard({ gateway }: { gateway: ProviderGateway }) {
  return (
    <article className="gateway-card">
      <div className="card-topline">
        <span className="category-chip">{CATEGORY_LABELS[gateway.category]}</span>
        <span className="gateway-badge">Provider directory · check availability on source</span>
      </div>
      <div className="gateway-title-row">
        <h3>{gateway.provider}</h3>
        <span className="coverage-note">{gateway.cityStatus === "city-page" ? "City page" : "Search city on provider"}</span>
      </div>
      <p className="card-description">{gateway.description}</p>
      <div className="gateway-details">
        <div><strong>Access cost</strong><p>{gateway.accessCost}</p></div>
        <div><strong>The exchange</strong><p>{gateway.exchange}</p></div>
      </div>
      <p className="gateway-relevance">{gateway.relevance}</p>
      <div className="card-footer">
        <p>{gateway.howToUse}</p>
        <a href={gateway.sourceUrl} target="_blank" rel="noopener noreferrer">Explore on {gateway.provider} ↗</a>
      </div>
    </article>
  );
}
