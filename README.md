# Simulated Prior Authorization Payer Portal

A self-contained mock of a payer's utilization-management provider portal, for developing and
testing automation against a prior-auth workflow without touching a real payer system.
Everything is fake: the plan ("Meridian Health Plan" is fictional), the users, the patients,
the providers and the requests.

## Two versions

| | Node server (`server.js`) | Static site (`docs/`) |
|---|---|---|
| Hosting | Render, Fly, Railway, VPS | **GitHub Pages** (or any static host) |
| Auth | Real server session cookie, 302 redirects, POST | Cosmetic: login/session run in browser JS, `sessionStorage` |
| Data | Fixed seed (same every login), in server memory | Fixed seed (same every login), regenerated from the seed kept in `sessionStorage` |
| JSON API | `/api/requests` | `window.simQueryRequests({...})` in the browser console |

The two versions share `style.css` and the generator (`docs/data.js` is `data.js` with a `window.SimData` export).

## Deploy the static site to GitHub Pages

1. Push this folder to a GitHub repo named `pauth-portal-sim1` (the `docs/` folder must be on the default branch).
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/docs`, Save.
3. After a minute the site is live at `https://<user>.github.io/pauth-portal-sim1/`. It routes with URL hashes (`#/login`, `#/requests?page=3`, `#/requests/285138`, `#/create`, `#/search`, `#/case-status`).

The page carries a `noindex` robots tag and a visible "simulated portal" banner. Nothing is sent anywhere: there is no backend.

To try it locally:

```bash
python3 -m http.server 8080 --directory docs
```

## Run the Node version

```bash
npm install
npm start
```

Open http://localhost:3000/login

## Login flow

1. **Sign in** — user IDs `jjackson`, `jnurse`, `ssmith`; password `Password123!` (see `USERS` in `server.js`).
2. **My Organization's Requests** — the grid view.

Two-step verification is currently **off**. To bring it back, start with `MFA_ENABLED=1 npm start`
(static version: set `MFA_ENABLED = true` at the top of `docs/app.js`). A 6-digit code is then "sent by SMS",
shown in the yellow *Simulated SMS* panel (element `#simCode`) and printed to the server console.
Wrong codes are rejected; 5 failures locks the session; codes expire after 10 minutes.
Add `MFA_CODE=123456` for a fixed code (static version: `FIXED_MFA_CODE`).

## Data

The dataset is generated from a **fixed seed**, so every login and every run sees the same 87–123 requests:
patient names, `UM######` reference numbers, tracking IDs, NPIs, dates in the ~120 days before the anchor
date, and statuses drawn from Approved, Denied, Partial Decision, Needs More Information, Not Submitted,
Review In Progress. Dates are anchored to a fixed date (`DATA_NOW`) rather than today, so they don't shift either.
Requests you create are added on top for the rest of that session.

Use `DATA_SEED=<n>` for a different fixed dataset, or `DATA_SEED=random` for a fresh one per login
(static version: `DATA_SEED` / `DATA_NOW` at the top of `docs/app.js`; `null` means random).

## Pages

| Route | What it is |
|---|---|
| `/login`, `/logout` (`/mfa` when enabled) | Fake authentication |
| `/requests` | Grid: 20 per page by default (`size`=10/20/50/100), `page`, sort by any column (`sort`, `dir`), filter panel (funnel icon) |
| `/requests/:trackingId` | Request detail |
| `/create` | Create New Request form (submit, or save as Not Submitted) |
| `/search` | Search Submitted Requests |
| `/case-status?referenceNumber=UM...` | Check Case Status |
| `/api/requests` | Same query params as `/requests`, returns JSON (needs a logged-in session cookie) |

Stable selectors for automation: `#username`, `#password`, `#signInBtn`, `#code`, `#verifyBtn`,
`#requestsGrid` (rows carry `data-tracking-id`), `#resultSummary`, `#pageInput`, `#pageSize`,
`#pageNext/#pagePrev/#pageFirst/#pageLast`, `#filterToggle`.

## Config

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `PORTAL_NAME` | `Meridian Health Plan` | Branding shown in the UI |
| `MFA_ENABLED` | off | `1` turns on the 2FA step |
| `MFA_CODE` | random | Fixed 2FA code (when 2FA is on) |
| `DATA_SEED` | `20261023` | Dataset seed; `random` for a new dataset per login |
| `DATA_NOW` | `2026-10-23T09:00:00` | Anchor date the dataset's dates count back from |
| `SESSION_SECRET` | dev value | Cookie signing secret |
