# StayZero

StayZero helps travellers find documented opportunities to stay without a nightly room rate. The destination picker suggests 90+ popular cities worldwide, and also accepts any place typed by the traveller. Results show provider pathways, source-linked research candidates for Bengaluru and Hyderabad, and AI-found public opportunities when configured. Candidates are unverified; availability and acceptance must be confirmed with the source.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. `/api/rank` returns destination-relevant provider pathways and deterministic scores for any curated stays with `ranked: "heuristic"`. Source-linked research candidates for Bengaluru and Hyderabad appear immediately. Configure RouterPlus to search any other destination and refresh the built-in leads. Local development saves new candidates to an ignored JSON file; Netlify saves them to persistent Netlify Blobs. Create a local, ignored `.env.local` in the project root and add:

```text
ROUTERPLUS_API_KEY=<your key>
ROUTERPLUS_BASE_URL=https://api.routerplus.com
```

Never put the key in the repo. `/api/health` reports seed validation and whether the two model calls are available; it skips calls when no key is set.

## Deploy to Netlify

The checked-in `netlify.toml` uses `npm run build` and `.next`; `.nvmrc` selects Node 22. Netlify's current Next.js adapter supports the app's App Router, route handlers, and Cache Components automatically. Connect this GitHub repository in Netlify and deploy its `main` branch. In the Netlify project environment variables, set `STAYZERO_STORAGE=netlify-blobs` so research survives function restarts and future deploys. Add `ROUTERPLUS_API_KEY` and `ROUTERPLUS_BASE_URL` there if you want AI research. Keep the API key server-side; never add it to `netlify.toml` or a `NEXT_PUBLIC_` variable.

## Curate the seed

`src/lib/seed.ts` starts empty because the previous records were placeholders with `example.com` links. The live MVP shows source-linked, unverified research candidates from [research-baseline.ts](src/lib/research-baseline.ts), plus destination-specific findings from the research agent when configured. See [ACCESS_RESEARCH.md](ACCESS_RESEARCH.md) for the sourcing decision. [SEED_REVIEW.md](SEED_REVIEW.md) remains a review queue. A human should open each candidate's source, confirm the exact stay terms and fees, and record the actual check date and reviewer in `verificationNote` before adding an `Opportunity` to the curated seed. A platform gateway should claim only that the platform offers a route to request a stay in that city, not that a particular host will accept the traveller.

The future curation target is at least 12 records, with at least eight in Bangalore and four in Hyderabad. Research candidates are shown separately with an unverified label and do not count toward that target. Run `npm run build` and check `/api/health` for `seedErrors: []` after curation.

## API behavior

- `POST /api/rank` filters the curated seed by normalized destination, category, and minimum stay. Trips longer than a listing's typical maximum are flagged as partial cover. A model response can only score IDs already in the filtered seed; an unknown ID is discarded. Missing key, timeout, and API errors return the deterministic fallback.
- `POST /api/deep-search` accepts a free-text destination, searches public program/opportunity pages when AI is configured, and persists results locally or in Netlify Blobs. It always marks candidates `live-unverified`; the UI gives them amber cards. Previously saved records can still be read when research is disabled or the key is missing.

Deployment and demo gates are in [BUILD_SPEC.md](BUILD_SPEC.md).
