# OPR Card Generator — Relay API

Tiny Express + TypeScript service that the static front-end calls to load an army.

It exists because OnePageRules' army feed (`/api/tts`) is browser-accessible
(CORS enabled) but **does not** include the descriptions of core/common rules
(Fast, Strider, Fearless, Tough, …). Those live at `/api/rules/common/{id}`,
which sends **no** CORS header — so a static browser app can't read it directly.

This service runs server-side (where CORS doesn't apply), fetches **both**
sources, merges the core rules into the army's `specialRules`, and returns one
combined payload. OPR permits this for **free, non-monetized community use**.

> The merge logic lives in [`src/relay.ts`](src/relay.ts) and has **no framework
> dependency** — it only uses the global `fetch`. Both this Express server
> (`src/server.ts`) and the production Netlify Function
> (`../netlify/functions/army.mts`) import it, so there is a single source of
> truth. This Express server is the local-dev path; Netlify is the deploy path.

## Endpoints

| Method | Path             | Description                                              |
| ------ | ---------------- | ------------------------------------------------------- |
| GET    | `/army?id=<id>`  | Army Forge list enriched with core rule descriptions.   |
| GET    | `/health`        | `{ "ok": true }` health check.                          |

If the common-rules fetch fails, `/army` still returns the army with only the
army-book rules (graceful degradation) — it never blocks on the enrichment.

## Run locally

From the repo root, run the front-end and this relay together:

```bash
yarn install       # once, at the repo root
yarn dev           # parcel + tsx watch (this server on http://localhost:3000)
```

Or run just the relay:

```bash
yarn api           # tsx watch, listens on http://localhost:3000
```

Test it:

```bash
curl "http://localhost:3000/army?id=kshNu1YdClC-"
```

In local dev the front-end auto-detects `localhost` and calls
`http://localhost:3000` (see `API_BASE` in `../index.ts`); in production it calls
the Netlify relay by its absolute URL.

## Hosting layout

The front-end and the relay live on **different origins**:

- **Front-end** → GitHub Pages (built into `../docs`).
- **Relay** → Netlify Function.

Because they're cross-origin, the function sends CORS headers (see
[`../netlify/functions/army.mts`](../netlify/functions/army.mts)) and the
front-end calls the relay by its absolute Netlify URL.

The relay restricts CORS to an allowlist (`ALLOWED_ORIGINS` in
[`../netlify/functions/army.mts`](../netlify/functions/army.mts)) so other web
apps can't use it from a browser — set `PRIMARY_ORIGIN` to your GitHub Pages
origin (scheme + host only, e.g. `https://<user>.github.io`, no path). Note that
CORS is browser-enforced: it doesn't block non-browser clients (curl, scripts).

## Deploy the relay on Netlify

Config lives in [`../netlify.toml`](../netlify.toml). Netlify hosts **only the
function** (the `netlify/site` status page is the published root); the function
is [`../netlify/functions/army.mts`](../netlify/functions/army.mts) (Netlify
Functions v2 — routing declared in-code via `config.path`, so no redirects).

1. Push the repo to GitHub.
2. Netlify → **Add new site → Import an existing project**, pick the repo.
3. Netlify reads `netlify.toml` automatically (no site build, functions dir
   `netlify/functions`, Node 20). Deploy.
4. Note your site URL (e.g. `https://opr-card-relay.netlify.app`). Check
   `https://<site>.netlify.app/health` returns `{ "ok": true }`.
5. Set `PROD_RELAY_BASE` in [`../index.ts`](../index.ts) to that URL (no trailing
   slash), then rebuild and publish the front-end to GitHub Pages (`yarn build`
   → commit `../docs`).

## Deploy as a standalone server (alternative)

This Express server still works on any Node 18+ host. Build with `yarn build`,
start with `yarn start` (`node dist/server.js`); it reads `PORT` from the env.

- **Render:** New → Web Service → root dir `api`, build
  `yarn install && yarn build`, start `yarn start`. Free tier spins down after
  ~15 min idle, so the first request after a nap can take ~50s.
- **Fly.io / Railway / Koyeb:** any Node 18+ host; same build/start commands.

If you deploy the relay separately from the front-end, set `API_BASE` in
`../index.ts` to the public URL and rebuild the front-end.

> Keep it free and non-commercial — that's the condition under which OPR is fine
> with community tools relaying this data.
