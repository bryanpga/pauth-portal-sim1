# Simulated Prior Authorization Payer Portal

A self-contained mock of a payer's utilization-management provider portal, for developing and
testing automation against a prior-auth workflow without touching a real payer system.
Everything is fake: the plan ("Meridian Health Plan" is fictional), the users, the patients,
the providers and the requests.

## Two versions

| | Node server (`server.js`) | Static site (`docs/`) |
|---|---|---|
| Hosting | Render, Fly, Railway, VPS | **GitHub Pages** (or any static host) |
| Auth | Real server session cookie, 302 redirects, POST | Cosmetic: login/2FA/session run in browser JS, `sessionStorage` |
| Data | Random per login, in server memory | Random per login, regenerated from a seed kept in `sessionStorage` |
| JSON API | `/api/requests` | `window.simQueryRequests({...})` in the browser console |

The two versions share `style.css` and the generator (`docs/data.js` is `data.js` with a `window.SimData` export).

## Deploy the static site to GitHub Pages

1. Push this folder to a GitHub repo named `pauth-portal-sim1` (the `docs/` folder must be on the default branch).
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/docs`, Save.
3. After a minute the site is live at `https://<user>.github.io/pauth-portal-sim1/`. It routes with URL hashes (`#/login`, `#/mfa`, `#/requests?page=3`, `#/requests/285138`, `#/create`, `#/search`, `#/case-status`).

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
2. **Two-step verification** — a 6-digit code is "sent by SMS". It is shown in the yellow
   *Simulated SMS* panel on the page (element `#simCode`) and printed to the server console.
   Wrong codes are rejected; 5 failures locks the session and returns you to sign in; codes expire after 10 minutes.
3. **My Organization's Requests** — the grid view.

Set `MFA_CODE=123456 npm start` for a fixed code in automated tests (static version: `FIXED_MFA_CODE` at the top of `docs/app.js`).

## Data

A **new random dataset is generated on every login** (350–549 requests): random patient names,
`UM######` reference numbers, tracking IDs, NPIs, dates within the last ~120 days, and statuses drawn from
Approved, Denied, Partial Decision, Needs More Information, Not Submitted, Review In Progress.
Each session sees its own dataset. The seed is logged (`[SIM DATA] ... seed N`) if you need to reproduce one
(`generateRequests(seed)` in `data.js`).

## Pages

| Route | What it is |
|---|---|
| `/login`, `/mfa`, `/logout` | Fake authentication + 2FA |
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
| `MFA_CODE` | random | Fixed 2FA code |
| `SESSION_SECRET` | dev value | Cookie signing secret |
