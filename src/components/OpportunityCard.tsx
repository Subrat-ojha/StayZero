import type { Opportunity } from "@/lib/seed";
import { displayLocation } from "@/lib/location";

export type RankedOpportunity = {
  opportunity: Opportunity;
  fit: number;
  reasons: string[];
  staysCapped: boolean;
};

const CATEGORY_LABELS: Record<Opportunity["category"], string> = {
  "free-stay": "Free or donation stay",
  "hospitality-exchange": "Hospitality exchange",
  "volunteer-exchange": "Volunteer exchange",
  "home-exchange": "Home exchange",
};

const SKILL_LABELS: Record<string, string> = {
  "web-development": "Web development",
  "graphic-design": "Graphic design",
  "social-media": "Social media",
  teaching: "Teaching",
  "hands-on-help": "Hands-on help",
};

export function OpportunityCard({ result }: { result: RankedOpportunity }) {
  const { opportunity: item, fit, reasons, staysCapped } = result;
  return (
    <article className="opportunity-card">
      <div className="card-topline">
        <span className="category-chip">{CATEGORY_LABELS[item.category]}</span>
        <span className="curated-badge">Curated · source checked {item.evidence.retrievedDate}</span>
      </div>
      <h3>{item.name}</h3>
      <p className="card-location">{[item.area, displayLocation(item.city)].filter(Boolean).join(" · ")}</p>
      <p className="card-description">{item.description}</p>

      <div className="card-columns">
        <div className="card-section">
          <p className="eyebrow">The cost</p>
          <p className="nightly-cost">₹0 <span>/ night</span></p>
          {item.cost.mandatoryExtras.map((extra, index) => (
            <p className="cost-extra" key={`${extra.label}-${index}`}>+ ₹{extra.amountINR.toLocaleString("en-IN")} {extra.label} / {extra.per}</p>
          ))}
          {item.cost.donationExpected && <p className="cost-extra">Donation expected (customary)</p>}
          {item.cost.notes && <p className="muted-small">{item.cost.notes}</p>}
        </div>
        <div className="card-section fit-section">
          <p className="eyebrow">Your match</p>
          <p className="fit-score">Fit: {fit}/100</p>
          <p className="muted-small">Match to what you offered · not odds of acceptance</p>
          <ul className="detail-list">{reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul>
        </div>
      </div>

      <div className="card-section requirements-section">
        <p className="eyebrow">What it asks of you</p>
        <div className="detail-chips">
          {item.requirements.skills.map((skill) => <span key={skill}>{SKILL_LABELS[skill]}</span>)}
          {item.requirements.hoursPerDay && <span>{item.requirements.hoursPerDay}h / day</span>}
          {item.requirements.idRequired && <span>ID required</span>}
          {item.requirements.referencesHelp && <span>References help</span>}
          {item.stay.minCommitmentNights && <span>Min {item.stay.minCommitmentNights} nights</span>}
          {item.stay.typicalMaxNights && <span>Up to {item.stay.typicalMaxNights} nights</span>}
        </div>
        {staysCapped && <p className="partial-cover">Shorter than your trip — partial cover</p>}
        {item.requirements.rules && item.requirements.rules.length > 0 && <ul className="detail-list">{item.requirements.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>}
      </div>

      <div className="card-section safety-section">
        <p className="eyebrow">Safety signals</p>
        <ul className="detail-list">{item.safety.map((signal) => <li key={signal}>{signal}</li>)}</ul>
      </div>

      <div className="card-footer">
        <p>{item.howToSecure}</p>
        <a href={item.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">View source ({item.evidence.sourceName}) ↗</a>
      </div>
    </article>
  );
}
