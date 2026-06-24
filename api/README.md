# OPR Card Generator — Relay API

Tiny Express + TypeScript service that the static front-end calls to load an army.

It exists because OnePageRules' army feed (`/api/tts`) is browser-accessible
(CORS enabled) but **does not** include the descriptions of core/common rules
(Fast, Strider, Fearless, Tough, …). Those live at `/api/rules/common/{id}`,
which sends **no** CORS header — so a static browser app can't read it directly.

This service runs server-side (where CORS doesn't apply), fetches **both**
sources, merges the core rules into the army's `specialRules`, and returns one
combined payload. OPR permits this for **free, non-monetized community use**.

## Endpoints

| Method | Path             | Description                                              |
| ------ | ---------------- | ------------------------------------------------------- |
| GET    | `/army?id=<id>`  | Army Forge list enriched with core rule descriptions.   |
| GET    | `/health`        | `{ "ok": true }` health check.                          |

If the common-rules fetch fails, `/army` still returns the army with only the
army-book rules (graceful degradation) — it never blocks on the enrichment.

## Run locally

```bash
cd api
npm install
npm run dev        # tsx watch, listens on http://localhost:3000
```

Test it:

```bash
curl "http://localhost:3000/army?id=kshNu1YdClC-"
```

The front-end is already pointed at `http://localhost:3000` (see `API_BASE` in
`../index.ts`). For production, set `API_BASE` to your deployed URL.

## Deploy (free options)

The app reads `PORT` from the environment and otherwise needs nothing. Build with
`npm run build`, start with `npm start` (`node dist/server.js`).

- **Render (simplest):** New → Web Service → connect repo, root dir `api`,
  build `npm install && npm run build`, start `npm start`. Free tier note: the
  service spins down after ~15 min idle, so the first request after a nap can
  take ~50s to wake up.
- **Fly.io / Railway / Koyeb:** any Node 18+ host works; same build/start
  commands.
- **Vercel:** deployable as a serverless function (faster cold starts, no
  spin-down delay). Ask if you want the `vercel.json` + entrypoint wiring.

After deploying, update `API_BASE` in `../index.ts` to the public URL and
rebuild the front-end.

> Keep it free and non-commercial — that's the condition under which OPR is fine
> with community tools relaying this data.
