"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { LiveResultCard } from "@/components/LiveResultCard";
import { OpportunityCard, type RankedOpportunity } from "@/components/OpportunityCard";
import { ProviderGatewayCard } from "@/components/ProviderGatewayCard";
import type { ProviderGateway } from "@/lib/provider-adapters";
import { CATEGORIES, CITIES, OFFER_SKILLS, type Category, type OfferSkill, type StoredDiscovery } from "@/lib/seed";

const CATEGORY_LABELS: Record<Category, string> = {
  "free-stay": "Free or donation stays",
  "hospitality-exchange": "Hospitality exchange",
  "volunteer-exchange": "Volunteer exchange",
  "home-exchange": "Home exchange",
};
const SKILL_LABELS: Record<OfferSkill, string> = {
  "web-development": "Web development",
  "graphic-design": "Graphic design",
  "social-media": "Social media",
  teaching: "Teaching",
  "hands-on-help": "Hands-on help",
};

type RankResponse = { ranked: "llm" | "heuristic"; results: RankedOpportunity[]; gateways: ProviderGateway[]; deepSearchEnabled: boolean };
type Theme = "light" | "dark";

export default function Home() {
  const [city, setCity] = useState<string>("Bangalore, India");
  const [nights, setNights] = useState(5);
  const [offers, setOffers] = useState<OfferSkill[]>([]);
  const [preference, setPreference] = useState<"any" | Category>("any");
  const [response, setResponse] = useState<RankResponse | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [liveResults, setLiveResults] = useState<StoredDiscovery[]>([]);
  const [liveAt, setLiveAt] = useState("");
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("stayzero-theme"); } catch { /* Storage can be unavailable. */ }
    const next: Theme = saved === "light" || saved === "dark"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = next;
  }, []);

  function toggleTheme() {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("stayzero-theme", next); } catch { /* Keep this visit's choice. */ }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResponse(null);
    setLiveResults([]);
    setLiveAt("");
    setLiveError("");
    try {
      const result = await fetch("/api/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, nights, offers, preference }),
      });
      if (!result.ok) throw new Error("Search is unavailable right now. Please try again.");
      const ranked = (await result.json()) as RankResponse;
      setResponse(ranked);
      setSearched(true);
      await deepSearch(false, city);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  async function deepSearch(refresh = false, destination = city) {
    setLiveLoading(true);
    setLiveError("");
    try {
      const result = await fetch("/api/deep-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: destination, refresh }),
      });
      if (!result.ok) throw new Error("Deep search is unavailable right now.");
      const data = (await result.json()) as { results: StoredDiscovery[]; at?: string; error?: string; saved?: boolean };
      setLiveResults(data.results);
      setLiveAt(data.at ?? "");
      if (data.error) setLiveError(data.error);
    } catch {
      setLiveError("Deep search is unavailable right now.");
    } finally {
      setLiveLoading(false);
    }
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="StayZero home"><span className="brand-mark">0</span> StayZero</Link>
        <div className="header-actions">
          <span className="header-note">A better starting point for a free stay</span>
          <button className="theme-toggle" type="button" onClick={toggleTheme}>
            <span className="theme-dark-label"><span aria-hidden="true">☾</span><span className="theme-label">Dark mode</span></span>
            <span className="theme-light-label"><span aria-hidden="true">☀</span><span className="theme-label">Light mode</span></span>
          </button>
        </div>
      </header>
      <main>
        <section className="hero">
          <p className="hero-kicker">STAY FOR LESS · KNOW MORE</p>
          <h1>Find a way to stay for <em>₹0.</em></h1>
          <p className="hero-copy">Explore free, donation, and exchange pathways. See membership costs and requirements before you reach out.</p>
        </section>

        <section className="search-panel" aria-labelledby="search-heading">
          <div className="section-heading"><span>01 / START HERE</span><h2 id="search-heading">Tell us about your trip</h2></div>
          <form onSubmit={submit}>
            <div className="form-grid">
              <label className="field">Destination
                <input list="destination-suggestions" value={city} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Mysuru, India" minLength={2} maxLength={100} required />
                <datalist id="destination-suggestions">{CITIES.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>
              </label>
              <label className="field">Nights
                <input type="number" min="1" max="365" value={nights} onChange={(event) => setNights(Number(event.target.value))} required />
              </label>
              <label className="field">Stay preference
                <select value={preference} onChange={(event) => setPreference(event.target.value as "any" | Category)}><option value="any">Any kind of stay</option>{CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</select>
              </label>
            </div>
            <fieldset className="offers-fieldset"><legend>What can you offer?</legend><div className="offer-options">
              {OFFER_SKILLS.map((skill) => <label className="check-option" key={skill}><input type="checkbox" checked={offers.includes(skill)} onChange={(event) => setOffers((current) => event.target.checked ? [...current, skill] : current.filter((item) => item !== skill))} /><span>{SKILL_LABELS[skill]}</span></label>)}
              <label className="check-option"><input type="checkbox" checked={offers.length === 0} onChange={() => setOffers([])} /><span>Nothing — free hospitality only</span></label>
            </div></fieldset>
            <button className="primary-button" type="submit" disabled={loading || !Number.isInteger(nights) || nights < 1}>{loading ? liveLoading ? "Researching stays…" : "Finding options…" : "Find my free stay →"}</button>
          </form>
        </section>

        <section className="results-section" aria-live="polite" aria-busy={loading}>
          {error && <p className="notice error" role="alert">{error}</p>}
          {searched && response && <>
            <div className="results-header"><div><span className="section-index">02 / YOUR OPTIONS</span><h2>Places to start</h2></div><p>{response.results.length > 0 ? `${response.results.length} curated ${response.results.length === 1 ? "option" : "options"} · ${response.ranked === "llm" ? "AI ranked" : "Rule based ranking"}` : `${response.gateways.length} provider ${response.gateways.length === 1 ? "pathway" : "pathways"}`}</p></div>
            {response.results.length === 0 ? <p className="curation-note">No human-reviewed stays are listed for {city} yet. Check the unverified research results below and confirm every detail with its source.</p> : <div className="card-list">{response.results.map((result) => <OpportunityCard key={result.opportunity.id} result={result} />)}</div>}
            {response.gateways.length > 0 && <div className="gateway-section"><div className="gateway-section-heading"><span className="section-index">03 / SEARCH AT THE SOURCE</span><h2>Explore provider directories</h2><p>These are ways to find a stay, not available rooms. Open the provider to check hosts and apply.</p></div><div className="gateway-list">{response.gateways.map((gateway) => <ProviderGatewayCard key={gateway.id} gateway={gateway} />)}</div></div>}
            <div className="deep-search-section"><div><span className="section-index">04 / RESEARCH THIS DESTINATION</span><h2>Research results <small>(unverified)</small></h2><p>Public opportunity pages checked for this destination. New searches run when the research key is configured; candidates need a fresh source check.</p></div>
              {response.deepSearchEnabled && <button type="button" className="secondary-button" onClick={() => void deepSearch(true)} disabled={liveLoading}>{liveLoading ? "Researching this destination…" : "Search for more sources ↗"}</button>}
              {liveLoading && <p className="muted-small" role="status">Searching public sources for {city}…</p>}
              {liveError && <p className="notice" role="status">{liveError}</p>}
              {liveAt && <p className="muted-small">Most recent research: {new Date(liveAt).toLocaleString()}</p>}
              {liveResults.length > 0 && <p className="muted-small">{liveResults.length} saved result{liveResults.length === 1 ? "" : "s"} for this destination. Check every source before relying on a result.</p>}
              <div className="live-list">{liveResults.map((result) => <LiveResultCard key={`${result.name}-${result.sourceUrl}`} result={result} />)}</div>
            </div>
          </>}
        </section>
      </main>
      <footer className="site-footer"><strong>StayZero</strong><p>StayZero finds publicly documented options. Acceptance, availability and current rules are not guaranteed — confirm with the source before traveling.</p></footer>
    </div>
  );
}
