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
| `/for/<slug>` | A version tailored by a Focus preset, e.g. `/for/ai`: matching projects, a fitting title. Kept out of search engines |
| `/img/<id>` | An image uploaded from the editor |
| `/edit/<your key>` | The editor. Any other key returns 404 |
| `/admin` | The editor's sign-in page: your password (set it once under *Sign-in* in the editor) or the edit key |
| `/sitemap.xml` | Home, `/stack` and every stack page, generated from the data |

Stack pages are generated automatically from project **tags** and **skills**. Add a tag in the editor,
publish, and its page exists. Slugs are lowercase with dashes (`Next.js` → `next-js`, `C++` → `c-plus-plus`).

## Deploy

```
npm install
npm run setup
```

`setup` logs in to Cloudflare (browser, or an API token saved in `.cf-token`, which git ignores), then creates the storage, the Pages project
and a random edit key, deploys, and writes your links to `EDIT-LINK.txt`. Run it again any time to
redeploy; it reuses everything and keeps the same key.

Lost the edit link? `npm run setup -- --new-key` makes a fresh one.

To deploy into an existing project (for example your current `shiplayer` site) instead of a new one:

```
$env:PAGES_PROJECT="shiplayer"; npm run setup       (PowerShell)
```

## Editing online

Open the editor link from `EDIT-LINK.txt`.

- **Edit on page** shows the real page beside the form. Click any outlined text and type; clicking text also opens its field in the form. Dotted text is calculated (like the repo count) and is changed in the form.
- **Focus** presets tailor the page to one kind of role: pick project categories (and extra stacks), and the title is written for you (for example "AI & Data Engineer"). Each preset has its own link, `/for/<slug>`, to send with an application. One preset can also be applied to the main address.
- **Sections**: reorder, hide, and add your own (a list with links, or paragraphs). The top menu follows the order.
- **Projects** can be pinned (shown first) or hidden without deleting them; long lists have a filter.
- **Gallery** and **About photo**: drop images in; they are resized in the browser (1600 px, WebP) and stored with the site. A viewer opens them full screen. *Clean up unused images* removes ones nothing uses.
- **Contact methods**: email, phone, calendar, GitHub and more, each with a copy button, plus a contact card (.vcf) visitors can save.
- **Change edit link** replaces the key at once; the old link stops working. On a device that has opened the editor, the site shows a small Edit button and Ctrl+Shift+E opens the editor (visitors never see it; *Forget this device* turns it off).
- **Every field** is a form: headline, intro, stats, layers, projects, references, experience, skills,
  about, contact, footer, plus links, email and search text.
- **Preview draft** opens the real page with your unpublished changes (marked "Draft preview").
- **Publish** saves to the live site. The version it replaces is kept; the last 30 are listed under
  *Previous versions* and can be loaded back and republished.
- **Edit as JSON**, **Export backup** and **Import backup** handle bulk or structural changes.
- `Ctrl+S` publishes. Leaving with unpublished changes asks first.
- Mark invented or placeholder entries with **Example data**; they show an "example" tag on the page.

The edit link works like a password. Anyone who has it can change the site. Change it from the editor
(*Change edit link*), or with `npm run setup -- --new-key`.

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
