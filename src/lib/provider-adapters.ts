import type { Category, City, OfferSkill } from "./seed";
import { displayLocation, normalizeLocation } from "./location";

export type ProviderGateway = {
  id: string;
  provider: string;
  category: Category;
  description: string;
  accessCost: string;
  exchange: string;
  cityStatus: "city-page" | "search-on-provider";
  sourceUrl: string;
  howToUse: string;
  relevance: string;
};

type ProviderAdapter = {
  id: string;
  category: Category;
  gateway: (city: City, offers: OfferSkill[]) => ProviderGateway;
};

const destinationName = (city: City) => displayLocation(city);
const knownLocation = (city: City) => normalizeLocation(city);
const isBangalore = (city: City) => knownLocation(city) === "bangalore";
const isHyderabad = (city: City) => knownLocation(city) === "hyderabad";

// Directory adapters only point to providers' own public pages. They do not
// fetch, copy, or claim access to host profiles, dates, or live availability.
const adapters: ProviderAdapter[] = [
  {
    id: "vipassana-course",
    category: "free-stay",
    gateway: (city) => ({
      id: `vipassana-course-${city}`,
      provider: isBangalore(city) ? "Dhamma Paphulla" : "Dhamma Khetta",
      category: "free-stay",
      description: "Residential Vipassana meditation course. This is a structured course, not a flexible overnight stay.",
      accessCost: "No standard nightly rate; confirm the center's current donation and course policy",
      exchange: "Attend and complete the full 10-day course under the center's rules; admission must be confirmed.",
      cityStatus: "city-page",
      sourceUrl: isBangalore(city)
        ? "https://paphulla.dhamma.org/about/how-to-learn/"
        : "https://www.khetta.dhamma.org/",
      howToUse: "Read the course rules and schedule, then apply through the center.",
      relevance: "Only suitable for a full residential course, typically 10 days",
    }),
  },
  {
    id: "bewelcome",
    category: "hospitality-exchange",
    gateway: (city) => ({
      id: `bewelcome-${city}`,
      provider: "BeWelcome",
      category: "hospitality-exchange",
      description: "Free nonprofit hospitality exchange. Members can search by location and request a stay from a host.",
      accessCost: "Free to join and use",
      exchange: "A host voluntarily offers hospitality; acceptance and length of stay are arranged directly.",
      cityStatus: "search-on-provider",
      sourceUrl: "https://www.bewelcome.org/",
      howToUse: `Create a profile, search for hosts in ${destinationName(city)}, and send a stay request.`,
      relevance: "Free hospitality; no skill exchange needed",
    }),
  },
  {
    id: "trustroots",
    category: "hospitality-exchange",
    gateway: (city) => ({
      id: `trustroots-${city}`,
      provider: "Trustroots",
      category: "hospitality-exchange",
      description: "Community for travellers and hosts. Review profiles and references before arranging a stay.",
      accessCost: "Free to use",
      exchange: "Hospitality is offered voluntarily by individual hosts.",
      cityStatus: "search-on-provider",
      sourceUrl: "https://www.trustroots.org/",
      howToUse: `Search ${destinationName(city)} on Trustroots and contact a suitable host.`,
      relevance: "Free hospitality; no skill exchange needed",
    }),
  },
  {
    id: "couchsurfing",
    category: "hospitality-exchange",
    gateway: (city) => ({
      id: `couchsurfing-${city}`,
      provider: "Couchsurfing",
      category: "hospitality-exchange",
      description: "Find local members and request a stay through Couchsurfing's own host search.",
      accessCost: "Access may require a paid subscription; confirm current price on the site",
      exchange: "A host voluntarily offers hospitality; availability is not shown by StayZero.",
      cityStatus: isBangalore(city) || isHyderabad(city) ? "city-page" : "search-on-provider",
      sourceUrl: isBangalore(city)
        ? "https://www.couchsurfing.com/places/Bangalore%2C%20Karnataka%2C%20India"
        : isHyderabad(city)
          ? "https://www.couchsurfing.com/c/locations/hyderabad-telangana-india"
          : "https://www.couchsurfing.com/",
      howToUse: `Search for ${destinationName(city)} on Couchsurfing and browse hosts there.`,
      relevance: isBangalore(city) || isHyderabad(city) ? "City page available; no skill exchange needed" : "Search this destination on Couchsurfing; no skill exchange needed",
    }),
  },
  {
    id: "worldpackers",
    category: "volunteer-exchange",
    gateway: (city, offers) => ({
      id: `worldpackers-${city}`,
      provider: "Worldpackers",
      category: "volunteer-exchange",
      description: "Browse host opportunities that exchange agreed volunteer work for accommodation.",
      accessCost: "Paid membership to apply or confirm trips; check the current plan and any host fees",
      exchange: "Tasks, hours, meals, accommodation, and minimum stay vary by host.",
      cityStatus: isBangalore(city) || isHyderabad(city) ? "city-page" : "search-on-provider",
      sourceUrl: isBangalore(city) || isHyderabad(city)
        ? `https://www.worldpackers.com/search/asia/india/${knownLocation(city)}`
        : "https://www.worldpackers.com/",
      howToUse: `Search for ${destinationName(city)}, inspect each host's terms, then apply on Worldpackers.`,
      relevance: offers.length > 0 ? "You offered skills; check each host's actual requirements" : "Volunteer work required; check each host's terms",
    }),
  },
  {
    id: "volunteer-yatra",
    category: "volunteer-exchange",
    gateway: (city, offers) => ({
      id: `volunteer-yatra-${city}`,
      provider: "Volunteer Yatra",
      category: "volunteer-exchange",
      description: "India-wide skill and time exchanges for stays and meals; check whether a suitable project exists in your city.",
      accessCost: "Paid membership; confirm the current plan and any project costs on the site",
      exchange: "Work, stay, meals, dates, and location depend on the project.",
      cityStatus: "search-on-provider",
      sourceUrl: "https://www.volunteeryatra.in/",
      howToUse: `Browse opportunities and confirm ${destinationName(city)} coverage before choosing a membership.`,
      relevance: offers.length > 0 ? "You offered skills; check project requirements" : "Volunteer work required; check project requirements",
    }),
  },
  {
    id: "homeexchange",
    category: "home-exchange",
    gateway: (city) => ({
      id: `homeexchange-${city}`,
      provider: "HomeExchange",
      category: "home-exchange",
      description: "Browse homes offered by members. An exchange or GuestPoints arrangement is needed.",
      accessCost: "Paid annual membership to complete exchanges; confirm the current price",
      exchange: "Offer your home or use GuestPoints according to the provider's rules.",
      cityStatus: isBangalore(city) || isHyderabad(city) ? "city-page" : "search-on-provider",
      sourceUrl: isBangalore(city)
        ? "https://www.homeexchange.com/home-exchange-inde/karnataka/bangalore"
        : isHyderabad(city)
          ? "https://www.homeexchange.com/home-exchange-india/telangana"
          : "https://www.homeexchange.com/",
      howToUse: `Search homes near ${destinationName(city)} and confirm exchange terms on HomeExchange.`,
      relevance: "Home or GuestPoints required",
    }),
  },
];

export function providerGateways(city: City, offers: OfferSkill[], preference: "any" | Category, nights: number): ProviderGateway[] {
  const vipassanaAvailable = isBangalore(city) || isHyderabad(city);
  const freeHospitalityProviders = new Set(["bewelcome", "trustroots"]);
  const selected = adapters
    .filter((adapter) => preference === "any" || adapter.category === preference ||
      (preference === "free-stay" && freeHospitalityProviders.has(adapter.id)))
    .filter((adapter) => adapter.id !== "vipassana-course" || (nights >= 10 && vipassanaAvailable))
    .map((adapter) => adapter.gateway(city, offers));
  return selected.sort((a, b) => {
    const score = (gateway: ProviderGateway) => {
      const categoryMatch = offers.length > 0
        ? gateway.category === "volunteer-exchange"
        : gateway.category === "hospitality-exchange";
      return Number(categoryMatch) * 2 + Number(gateway.cityStatus === "city-page");
    };
    return score(b) - score(a) || a.provider.localeCompare(b.provider);
  });
}
