# Eric Champ — portfolio

A static portfolio on Cloudflare Pages with an online editor, version history and one URL per stack.
Only a free Cloudflare account is needed.

## What lives where

| Path | What it is |
|---|---|
| `public/` | The site: `index.html`, `styles.css`, `main.js`, the editor, and `site.json` (the starting data) |
| `functions/` | Cloudflare Pages Functions: page rendering, stack pages, editor access, the save API |
| `lib/site.js` | Shared server helpers: load/save, validation, edit-key check, stack index |
| `scripts/setup.mjs` | One-command setup and deploy |

All text and data is one JSON document. After the first publish it is stored in Cloudflare KV
(key `site`); until then the bundled `public/site.json` is used.

## URLs

| URL | Shows |
|---|---|
| `/` | The portfolio, with the live data rendered in |
| `/stack` | Every stack, with how many projects use it |
| `/stack/<slug>` | Projects built with that stack, e.g. `/stack/rust`, `/stack/next-js`, `/stack/pgvector` |
| `/edit/<your key>` | The editor. Any other key returns 404 |
| `/sitemap.xml` | Home, `/stack` and every stack page, generated from the data |

Stack pages are generated automatically from project **tags** and **skills**. Add a tag in the editor,
publish, and its page exists. Slugs are lowercase with dashes (`Next.js` → `next-js`, `C++` → `c-plus-plus`).

## Deploy

```
npm install
npm run setup
```

`setup` opens your browser once to log in to Cloudflare, then creates the storage, the Pages project
and a random edit key, deploys, and writes your links to `EDIT-LINK.txt`. Run it again any time to
redeploy; it reuses everything and keeps the same key.

To deploy into an existing project (for example your current `shiplayer` site) instead of a new one:

```
$env:PAGES_PROJECT="shiplayer"; npm run setup       (PowerShell)
```

## Editing online

Open the editor link from `EDIT-LINK.txt`.

- **Every field** is a form: headline, intro, stats, layers, projects, references, experience, skills,
  about, contact, footer, plus links, email and search text.
- **Preview draft** opens the real page with your unpublished changes (marked "Draft preview").
- **Publish** saves to the live site. The version it replaces is kept; the last 30 are listed under
  *Previous versions* and can be loaded back and republished.
- **Edit as JSON**, **Export backup** and **Import backup** handle bulk or structural changes.
- `Ctrl+S` publishes. Leaving with unpublished changes asks first.
- Mark invented or placeholder entries with **Example data**; they show an "example" tag on the page.

The edit link works like a password. Anyone who has it can change the site. To rotate it, delete
`EDIT-LINK.txt` and run `npm run setup` again.

## Run locally

```
npm run dev          # http://localhost:8788  real Functions + local storage; publishing works
python serve.py      # http://localhost:5173  static preview only, no publishing
```

For `npm run dev` the local edit key is in `.dev.vars` (`ADMIN_KEY=...`); open
`http://localhost:8788/edit/<that key>`. Local edits are stored in `.wrangler/` and never reach the live site.

## Design direction

Editorial engineering site: one solid ground, one accent, hairline rules instead of cards, text lists
instead of chips, project rows instead of tiles. Geist and Geist Mono. Each section heading has a small
data-driven animation that shows what the section means.
