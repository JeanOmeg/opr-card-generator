# OPR Card Generator

A small TypeScript/Parcel web app that turns a shared [Army Forge](https://army-forge.onepagerules.com)
list into printable, TCG-sized unit cards for [OnePageRules](https://onepagerules.com) games.

Paste a shared army link, get one card per unit (stats, special rules, weapons),
plus a combined special-rules table and a spells table — ready to print or
download as PNGs.

**App:** <https://jeanomeg.github.io/opr-card-generator/>

> **Note:** a list only loads if you shared it in Army Forge — open your army and
> click **“Share as Link”** first. Private (unshared) lists cannot be read.

## Features

- One printable card per unit: Quality / Defense / Tough, special rules, weapons, notes.
- Combined **special-rules table** (including core/common rule descriptions) and a **spells table** for casters.
- Per-card **background image** with drag-to-move, scroll/slider zoom, opacity and recenter.
- **Print** layout (choose cards / rules / spells) and **PNG** download (single or all).
- **My Lists** — every generated list is saved locally (IndexedDB via Localbase) so you can
  reload it instantly, refresh it on demand, or delete it.
- **Cache-first loading** — *Generate Cards* opens a previously loaded list instantly from your
  saved copy (works offline); use **Refresh List** to pull the latest version from Army Forge.
- **FAQ**, **Changelog**, and **About** pages.

## Project structure

```
index.html              App shell: top bar, hamburger drawer, the three views
index.ts                Front-end bootstrap + Home controller
src/
  types.ts              Army Forge payload types
  api.ts                Data fetching
  render.ts             Card / table rendering + image pan-zoom + PNG export
  router.ts             Hash router + drawer (#/, #/lists, #/faq)
  db.ts                 Localbase wrapper (save / get / delete saved lists)
  views/lists.ts        "My Lists" view (Load / Refresh / Delete)
style.css               All styles
docs/                   Production build output (served by GitHub Pages)
```

## Local development

```sh
yarn install
yarn dev      # start the local dev environment
```

Run pieces individually with `yarn start` (front-end dev server) or build with
`yarn build`.

## Scripts

```sh
yarn dev        # local dev environment
yarn start      # front-end only (Parcel dev server)
yarn build      # production build into docs/
yarn typecheck  # type-check the front-end
```

On Windows PowerShell, use `yarn.cmd` if the execution policy blocks `yarn.ps1`.

## Deploy

`yarn build` outputs the site into `docs/`; commit it and push. GitHub Pages
serves the app from `docs/` on the default branch.

> Keep it free and non-commercial — that's the condition under which OnePageRules
> is fine with community tools using this data.

## Disclaimer

This is a **free, non-profit project made by a fan, for fans**. It is not
affiliated with, endorsed by, or sponsored by OnePageRules.

OnePageRules and all of its game systems, rules, and content (Grimdark Future,
Age of Fantasy, and others) are the property of **OnePageRules**. This tool only
helps players display their own army lists, and is offered free of charge for
non-commercial community use.

## License

Licensed under the **PolyForm Noncommercial License 1.0.0** — free to use, copy,
modify, and share for **any noncommercial purpose**. Commercial use, including
monetizing the project in any form, is **not permitted**. See [LICENSE](LICENSE).
