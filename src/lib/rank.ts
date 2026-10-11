import type { OfferSkill, Opportunity } from "./seed";

export type RankedScore = { id: string; fit: number; reasons: string[] };

export function heuristicRank(
  listings: Opportunity[],
  offers: OfferSkill[],
): RankedScore[] {
  return listings
    .map((listing) => {
      let fit = 50;
      const reasons: string[] = [];
      const requested = listing.requirements.skills;
      const matches = requested.filter((skill) => offers.includes(skill));

      if (offers.length === 0 && requested.length === 0) {
        fit += 20;
        reasons.push("Open to all travellers — no skills required");
      } else if (offers.length > 0 && matches.length > 0) {
        fit += Math.min(matches.length * 10, 30);
        reasons.push(...matches.map((skill) => `Requests ${skill.replaceAll("-", " ")}, which you offered`));
      } else if (offers.length > 0 && requested.length > 0) {
        fit -= 15;
        reasons.push(`Requires ${requested.map((skill) => skill.replaceAll("-", " ")).join(", ")}, which you did not offer`);
      }

      if (listing.kind === "place") {
        fit += 10;
        reasons.push("Direct place to contact");
      }
      if (listing.cost.mandatoryExtras.length === 0) {
        fit += 5;
        reasons.push("No mandatory extra fee listed");
      }

      return {
        id: listing.id,
        fit: Math.max(0, Math.min(100, fit)),
        reasons: reasons.slice(0, 3),
      };
    })
    .sort((a, b) => b.fit - a.fit || a.id.localeCompare(b.id));
}
