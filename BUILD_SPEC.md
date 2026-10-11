# StayZero — Build Spec (handoff document)

> **Implementation update:** This handoff captures the original two-city plan. The app now accepts any destination, automatically requests optional public-source research, and stores unverified research in a local JSON prototype dataset. For the current behavior, architecture, API, and limits, read [HOW_IT_WORKS.md](HOW_IT_WORKS.md). Its current implementation notes supersede older city-enum and in-memory deep-search details below.

Written by Fable 5 on 2026-10-11 so a cheaper model (or a human) can finish the build without re-planning. Follow this file top to bottom. Do not redesign; do not add features not listed here. Do not run `git commit`/`push` or deploy anywhere without the user's explicit permission in the current message.

## 1. Product in one paragraph

**StayZero — "Find a way to stay for ₹0."** The user enters a city (Hyderabad or Bangalore), number of nights, what they can offer (skills or nothing), and a stay preference. The app returns ranked **opportunities to secure accommodation without paying a nightly rate**, across 4 categories: truly-free/donation stays (gurudwara sarais, dharamshalas, Vipassana centers, ashrams), hospitality exchange (BeWelcome etc.), volunteer/skill exchange (Worldpackers etc.), and home exchange. Every card shows: honest total cost (₹0 nightly + any membership/donation/extras), requirements, an evidence link to the original source, a fit score with transparent reasons, and safety signals. **The pitch is trust: the AI can never fabricate a listing — this is enforced structurally (see §5), not by prompt.**

## 2. Current state (already done — do not redo)

- App scaffolded at `D:\vibesprint\stayzero`: Next.js 16.4 (App Router, Turbopack, **Cache Components enabled**), TypeScript, Tailwind, src dir, no import-alias prompt (alias `@/*` = `src/*`). Deps installed: `@anthropic-ai/sdk`, `zod`.
- `npm run build` **passes** as of handoff.
- Existing files:
  - `src/lib/seed.ts` — full zod schema + `Opportunity` type + `LiveResult` type + 3 **PLACEHOLDER** records (fake example.com URLs, marked NOT YET VERIFIED) + `validateSeed()`.
  - `src/lib/anthropic.ts` — client factory. Env: `ROUTERPLUS_API_KEY`, optional `ROUTERPLUS_BASE_URL` (default `https://api.routerplus.com`). Exported model ids: `RANK_MODEL = "claude-haiku-5-5"`, `DEEP_SEARCH_MODEL = "claude-sonnet-5-5"` (these are the ids RouterPlus actually serves — NOT claude-haiku-4-5).
  - `src/app/api/health/route.ts` — smoke test: one haiku ping + one sonnet call with `web_search_20250305` tool. Returns JSON with any errors inline.
  - `src/app/page.tsx` — static list of seed records (placeholder UI, will be replaced in §6).
- `.env.local` **does not exist yet** (a permission gate blocked writing the key). User must create `D:\vibesprint\stayzero\.env.local`:
  ```
  ROUTERPLUS_API_KEY=<tm_vk_... key from ~/.claude/settings.json env.ANTHROPIC_AUTH_TOKEN>
  ROUTERPLUS_BASE_URL=https://api.routerplus.com
  ```

### Known gotchas (cost real time already — respect them)

1. **Next 16 Cache Components:** `export const dynamic = "force-dynamic"` is a build error. For GET route handlers that must run per-request, `import { connection } from "next/server"` and `await connection()` first. POST handlers are fine as-is.
2. **RouterPlus monthly cap is EXCEEDED as of 2026-10-11** (429 "key monthly cap exceeded; resets 2026-11-01"). All LLM calls through this key may fail until reset or a new key. Therefore: **build the deterministic fallback first (§7), treat LLM ranking as progressive enhancement, and keep the `api/health` smoke test as the go/no-go gate.** The app must demo fully without any LLM call.
3. Placeholder seed records have `example.com` URLs — the UI works, but they must be replaced (§8) before any demo.

## 3. Remaining work, in order

| # | Task | Gate before moving on |
|---|------|----------------------|
| 1 | `src/lib/rank.ts` — deterministic fallback ranking (§7) | unit-testable pure function; build passes |
| 2 | Replace `page.tsx` with search form + results; add `src/components/OpportunityCard.tsx` (§6) | Hyderabad search shows only Hyd rows; badges correct; source links clickable |
| 3 | `src/app/api/rank/route.ts` — LLM ranking with id-join (§5.A) | unknown id in model output is dropped; LLM failure → fallback result, never an error page |
| 4 | Seed-data sprint (§8) — replace placeholders with 12–30 real records | `validateSeed()` returns []; every URL opened by a human today |
| 5 | OPTIONAL (skip if time or credits are short): `src/app/api/deep-search/route.ts` (§5.B) + amber UI | sourceless results dropped; kill switch `DEEP_SEARCH=off` hides button |
| 6 | Polish + deploy (Vercel CLI; needs user login) + record demo (§9) | demo script runs clean twice on the deployed URL |

## 4. Data model (already in `src/lib/seed.ts` — reference only)

`Opportunity`: `id` (slug), `name`, `category` ∈ `free-stay | hospitality-exchange | volunteer-exchange | home-exchange`, `city` ∈ `hyderabad | bangalore`, `area?`, `kind` ∈ `place | platform-gateway`, `description`, `cost { nightlyINR: 0 (literal), mandatoryExtras[{label, amountINR, per: night|stay|year}], donationExpected, notes? }`, `stay { typicalMaxNights?, minCommitmentNights? }`, `requirements { skills[] ⊂ OFFER_SKILLS, hoursPerDay?, idRequired, referencesHelp, rules?[] }`, `evidence { sourceUrl (url), sourceName, retrievedDate (YYYY-MM-DD), verification: "curated-human" (literal), verificationNote }`, `safety[] (min 1)`, `howToSecure`.

`LiveResult` (deep search only): `name, category, city, description, costSummary, requirementsSummary, sourceUrl, sourceName, verification: "live-unverified" (literal)`.

The two `verification` literals are the badge mechanism: the green badge component must accept ONLY an `Opportunity`, the amber badge ONLY a `LiveResult`. Never merge the types.

## 5. LLM usage — exactly two call types, both optional at demo time

### A. `POST /api/rank` (claude-haiku-5-5)

Request body: `{ city, nights: number, offers: OfferSkill[], preference: "any" | Category }`.

1. **Hard-filter in code first** (no LLM): `SEED.filter(o => o.city === city)`; if `preference !== "any"` filter category; drop records where `nights < minCommitmentNights` or (`typicalMaxNights` exists and `nights > typicalMaxNights` — keep but flag `staysCapped: true` instead of dropping, since a 5-night trip can still use a 3-night sarai for part of it; put this flag in the response).
2. Compute `fallback = heuristicRank(survivors, offers)` (§7). If `ROUTERPLUS_API_KEY` missing → return fallback immediately with `ranked: "heuristic"`.
3. One `client.messages.create` call, 8s timeout (`Promise.race`), `max_tokens: 1500`, forced tool use:
   - `tools: [{ name: "score_listings", description: "Score each listing by id", input_schema: { type: "object", properties: { scores: { type: "array", items: { type: "object", properties: { id: {type:"string"}, fit: {type:"number"}, reasons: {type:"array", items:{type:"string"}, maxItems: 3} }, required: ["id","fit","reasons"] } } }, required: ["scores"] } }]`, `tool_choice: { type: "tool", name: "score_listings" }`.
   - System prompt: "You score accommodation opportunities for fit against what a traveller offers. You may ONLY score the listings provided, referenced by id. Never add, rename, or invent listings. Reasons must cite the traveller's stated offer or the listing's stated requirements — never invent facts, availability, or acceptance odds."
   - User content: JSON of `{ traveller: {nights, offers, preference}, listings: survivors.map(minimal fields: id, category, kind, description, requirements, stay, cost summary) }`.
4. **Validate:** parse tool_use input with zod; **drop any id not in the survivor set**; clamp fit 0–100; max 3 reasons each. On ANY error/timeout/429 → return fallback with `ranked: "heuristic"`.
5. Response: `{ ranked: "llm" | "heuristic", results: [{ opportunity: <full seed record joined by id>, fit, reasons }] }` sorted by fit desc. **All display facts come from the seed join — the model only ever contributes `fit` and `reasons`.**

### B. `POST /api/deep-search` (claude-sonnet-5-5 + web_search) — OPTIONAL

Body: `{ city }`. Guard: if `process.env.DEEP_SEARCH === "off"` → 404. In-memory `Map<city, {at: string, results: LiveResult[]}>` cache; serve cache if present (include `at` timestamp in response — the UI shows "AI web search run at {at}").

One call: `max_tokens: 2000`, `tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]`. Prompt: search for free/donation-based or work-exchange accommodation in {city}, India; return STRICT JSON array (no prose) of candidates, each REQUIRING a real `sourceUrl` you actually saw in search results; omit anything without a source; never estimate acceptance odds; fields: name, category (one of the 4), description, costSummary, requirementsSummary, sourceUrl, sourceName.

Server: extract last text block, `JSON.parse` (tolerate ```json fences), zod-validate each against `liveResultSchema` with `verification` forced to `"live-unverified"` and `city` forced to the request city, **drop invalid/sourceless items**, dedupe against seed by hostname+name similarity (simple: drop if `SEED.some(s => liveUrlHostname === seedUrlHostname)`), cap 6. Any error → `{ results: [], error: "deep search unavailable" }` (UI shows a quiet notice, never a crash).

## 6. UI spec (`page.tsx` + `OpportunityCard.tsx`)

Client component page (form state), calls `/api/rank` on submit.

**Form:** city select (Hyderabad/Bangalore); nights number input (default 5, min 1); "What can you offer?" checkboxes from `OFFER_SKILLS` labels (Web development, Graphic design, Social media, Teaching, Hands-on help) + "Nothing — free hospitality only" (clears others); preference select (Any / each category). Submit: "Find my free stay".

**OpportunityCard (curated):**
- Header: name, area·city, category chip, **green badge**: `Curated — source checked {retrievedDate}`.
- Fit block (when ranked): `Fit: {fit}/100` + bulleted reasons, labelled "match to what you offered — not odds of acceptance".
- Cost block: "₹0 / night" large; each mandatoryExtra as `+ ₹{amount} {label} / {per}`; if donationExpected: "Donation expected (customary)".
- Requirements: chips for skills, `{hoursPerDay}h/day`, "ID required", rules as small list; stay limits (`up to N nights` / `min N nights`); if `staysCapped`: note "shorter than your trip — partial cover".
- Safety: small list of `safety[]` strings.
- Footer: `howToSecure` sentence + **"View source ({sourceName}) ↗"** link (target=_blank) — must be visually prominent.

**LiveResultCard (separate component, deep search only):** amber badge `Unverified — AI web result, check the source`, name, description, costSummary, requirementsSummary, source link. Visually distinct (amber border). Rendered in a separate "AI deep search (unverified)" section under a button `Search the live web with AI` that only appears when deep-search is enabled (probe: the rank response can include `deepSearchEnabled: boolean`, or just attempt and hide on 404).

**Persistent footer disclaimer (already drafted):** "StayZero finds publicly documented options. Acceptance, availability and current rules are not guaranteed — confirm with the source before traveling."

Empty state: "No curated options match — try 'Any' preference." Loading: disabled button + "Ranking options…".

## 7. Deterministic fallback ranking (`src/lib/rank.ts`) — build FIRST

Pure function `heuristicRank(listings: Opportunity[], offers: OfferSkill[]): {id, fit, reasons}[]`:
- Base 50.
- +20 if `requirements.skills.length === 0` (open to everyone) when offers is empty; if offers non-empty: +10 per overlapping skill (cap +30), −15 if listing requires skills and overlap is zero.
- +10 if `kind === "place"` (directly securable) ; +5 if no `mandatoryExtras`.
- Reasons are template strings citing real fields, e.g. `"Requests ${skill}, which you offered"`, `"Open to all travellers — no skills required"`, `"No membership fee"`, `"Requires ${s} which you did not offer"`. Cap 3.
- Clamp 0–100, sort desc. This is the guaranteed demo path while the RouterPlus cap is exceeded.

## 8. Seed-data sprint (the core asset — human time, zero LLM cost)

Replace the 3 placeholders with **12–30 real records** (floor 12: ~8 Bangalore, 4 Hyderabad; demo city is Bangalore). Process: find candidate → **open the URL in a browser today** → confirm it documents a free/donation/exchange stay → fill the record honestly (including fees in `mandatoryExtras` — honesty IS the product) → set `retrievedDate` to the actual date and `verificationNote` to what was confirmed and by whom. Candidates to check (NOT yet verified — verify before use):

**Places:** Gurudwara Sri Guru Singh Sabha Ulsoor (Bangalore) sarai; Gurudwara Saheb Secunderabad (Hyderabad); dharamshalas/choultries near Majestic (Blr) and Secunderabad station (Hyd); Vipassana centers — Dhamma Paphulla (Blr) and Dhamma Khetta (Hyd) — free 10-day residential courses, donation-based, strict course-attendance requirement (category free-stay, rules: "must complete full 10-day course", minCommitmentNights 10); Ramakrishna Math guest stays (usually devotees only — record the condition or drop). **ISKCON guest houses are typically PAID — exclude unless verified free.**

**Platform gateways** (one per platform per city, `kind: "platform-gateway"`, link to the platform's PUBLIC city page; the verified claim is modest: "platform operates here, listings visible on {date}, membership ₹X"): BeWelcome (free, nonprofit), Trustroots (free), Couchsurfing (paid membership — record amount), Worldpackers (membership ≈ $50/yr — record in INR approx), WWOOF India (membership fee — record), HomeExchange (membership — record). Categories: hospitality-exchange for the first three, volunteer-exchange for Worldpackers/WWOOF, home-exchange for HomeExchange.

After editing seed.ts run the build and confirm `validateSeed()` returns `[]` (hit `/api/health`, which includes `seedErrors`).

## 9. Demo script (~90s, works with heuristic ranking only)

1. "Travel search asks 'which room?' StayZero asks 'how do I stay for ₹0?'"
2. Search **Bangalore / 5 nights / web development / any**.
3. Top volunteer-exchange card: point at fit reasons citing the web-dev offer, and the honest cost line showing the membership fee next to ₹0/night.
4. Gurudwara/Vipassana card: ₹0, donation expected, rules visible, green curated badge — click "View source" live.
5. If deep search is enabled and credits allow: click it, show amber "Unverified" rows. Otherwise say: "The AI layer extends this live, but it is never allowed to pretend it verified anything — badges are earned by humans."
6. Close: "Every card links to its source; fees are shown, not hidden; fit is explained, acceptance is never promised. The product is trust."

## 10. Deploy + verification checklist

- Deploy: `vercel` CLI from `D:\vibesprint\stayzero` (user must `vercel login` first; set `ROUTERPLUS_API_KEY` env in Vercel dashboard or `vercel env add`). Only with the user's go-ahead.
- [ ] `npm run build` passes
- [ ] `/api/health` → `seedErrors: []`; note haiku/webSearch pass-fail (expected FAIL until key resets — that's OK)
- [ ] Hyderabad search returns only Hyderabad rows
- [ ] Bangalore/5-nights/web-dev ranks a volunteer listing up with offer-citing reasons (heuristic path)
- [ ] Simulated LLM failure (unset key) still renders ranked results (`ranked: "heuristic"`)
- [ ] Unknown id injected into a mock LLM response is dropped (code-review level check is fine)
- [ ] Every rendered source link opens the documented page
- [ ] Green badge appears on zero deep-search rows (type-level: LiveResultCard has no badge prop path to green)
- [ ] No `git commit`/`push`/deploy happened without explicit user permission
