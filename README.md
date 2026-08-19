# Redhills Stays — Call Tracker

A dense, single-purpose tool for coordinating hotel calls near Sri Angala
Eshwari Temple (Padiyanallur / Red Hills, Chennai 600052) for one temple
visit. It's built for **operating** a list while you're on the phone, not
for browsing — sort, filter, tap into a stay, log what they said, save.

No login. Anyone with the URL can view and edit. That's intentional: this
is a shared clipboard for one trip, not a product.

## Running locally

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. In plain `vite dev` there's no serverless
runtime, so the app talks to `localStorage` instead of the shared API — you'll
see a banner: **"Local only — not shared until Vercel env is set."** That's
expected; the data is seeded from `data/hotels.json` on first load.

```bash
npm run build     # production build into dist/
npm run preview   # serve the build locally (also localStorage-only, see above)
```

## How persistence works (no database)

There's no Postgres/Mongo/Firebase/Supabase here. The **source of truth is
`data/hotels.json` in this GitHub repo**, read and written through the GitHub
Contents API from a Vercel serverless function:

- `GET /api/hotels` → reads `data/hotels.json` from the repo (via
  `GET /repos/{repo}/contents/data/hotels.json`) and returns it as JSON.
- `PUT /api/hotels` → re-fetches the file's current `sha`, then commits the
  full updated `hotels` array back to the repo on the configured branch.

Every save is a real git commit. That's the whole database. Concurrent edits
are **last-write-wins** on the full array — fine for one person coordinating
a trip, not fine for a real multi-writer product.

### Vercel environment variables

Set these on the Vercel project (Settings → Environment Variables). There is
no user login, so these are the only credentials involved, and they never
reach the browser — only the serverless function reads them:

| Variable         | Example                          |
|-------------------|-----------------------------------|
| `GITHUB_TOKEN`     | a fine-grained PAT with **contents: read & write** on this repo |
| `GITHUB_REPO`      | `Biotechtamilan/redhills-stays`  |
| `GITHUB_BRANCH`    | `main`                           |

If these aren't set (e.g. a preview deploy without env configured, or local
`vite dev`/`vite preview`), `/api/hotels` responds `503 not_configured` and
the frontend transparently falls back to `localStorage`, showing the "Local
only" banner. The app never breaks — it just stops being shared.

## Features

- **Operate**: dense list sorted by distance by default, tap any row to open
  a detail drawer — status, contacted + timestamp, quoted amount, what they
  said, free-text notes. Save persists via the API (or localStorage).
- **Compare**: sort by distance / rating / name / status; filter by status
  chips, free-text search, and a "has phone" toggle.
- **Add stay**: append a stay that isn't in the seed set (`added_by_user: true`).
- Maps link on every row; WhatsApp link auto-appears for `+91` numbers.
- Adventure Hunt is marked `closed: true` in the data and rendered struck
  through with a "Closed" badge.
- "You shared" badge for stays already sent to whoever you're coordinating
  with (`you_shared: true`).
- Export JSON button downloads the current dataset as-is.
- Mobile-first hit targets (44px+), sticky header with a live count.

## Stack

Vite + vanilla JS (no framework — the surface area doesn't need one), one
Vercel serverless function (`api/hotels.js`, Node runtime), plain CSS. No
Next.js, no ORM, no auth.
