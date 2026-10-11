# StayZero

StayZero helps travellers find documented opportunities to stay without a nightly room rate. Enter any destination; Bangalore and Hyderabad are suggestions. Results show provider pathways and, when configured, AI-found public opportunities with source links. Availability and acceptance must be confirmed with the source.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. `/api/rank` returns destination-relevant provider pathways and deterministic scores for any curated stays with `ranked: "heuristic"`. When a RouterPlus key is configured, each search also researches public sources for that destination. Local development saves candidates to an ignored JSON file; Netlify can save to persistent Netlify Blobs. The optional RouterPlus settings go in a local, ignored `.env.local`:

```text
ROUTERPLUS_API_KEY=<your key>
ROUTERPLUS_BASE_URL=https://api.routerplus.com
```

Never put the key in the repo. `/api/health` reports seed validation and whether the two model calls are available; it skips calls when no key is set.

## Deploy to Netlify

The checked-in `netlify.toml` uses `npm run build` and `.next`; `.nvmrc` selects Node 22. Netlify's current Next.js adapter supports the app's App Router, route handlers, and Cache Components automatically. Connect this GitHub repository in Netlify and deploy its `main` branch. In the Netlify project environment variables, set `STAYZERO_STORAGE=netlify-blobs` so research survives function restarts and future deploys. Add `ROUTERPLUS_API_KEY` and `ROUTERPLUS_BASE_URL` there if you want AI research. Keep the API key server-side; never add it to `netlify.toml` or a `NEXT_PUBLIC_` variable.

## Curate the seed

`src/lib/seed.ts` starts empty because the previous records were placeholders with `example.com` links. The live MVP uses outbound source gateways from `src/lib/provider-adapters.ts`; see [ACCESS_RESEARCH.md](ACCESS_RESEARCH.md) for the sourcing decision. [SEED_REVIEW.md](SEED_REVIEW.md) is a research queue, not verified listings. A person should open each source, confirm the exact stay terms and fees, and record the actual check date and reviewer in `verificationNote` before adding an `Opportunity`. A platform gateway should claim only that the platform offers a route to request a stay in that city, not that a particular host will accept the traveller.

The target is at least 12 records, with at least eight in Bangalore and four in Hyderabad. Run `npm run build` and check `/api/health` for `seedErrors: []` after curation. Until then the app intentionally shows an empty state and is not ready for a public demo.

## API behavior

- `POST /api/rank` filters the curated seed by normalized destination, category, and minimum stay. Trips longer than a listing's typical maximum are flagged as partial cover. A model response can only score IDs already in the filtered seed; an unknown ID is discarded. Missing key, timeout, and API errors return the deterministic fallback.
- `POST /api/deep-search` accepts a free-text destination, searches public program/opportunity pages when AI is configured, and persists results locally or in Netlify Blobs. It always marks candidates `live-unverified`; the UI gives them amber cards. Previously saved records can still be read when research is disabled or the key is missing.

Deployment and demo gates are in [BUILD_SPEC.md](BUILD_SPEC.md).
