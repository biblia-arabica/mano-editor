# Authority index generator

`build-index.js` scans the repository's `data/` directories and writes the
`index/index-{type}.json` files that the editors load through `BA.authority`
(autocomplete, `resolve`, `nextId`, collision checks). It has **no npm
dependencies** — plain Node.

## Data layout

TEI records live in this same repository, one file per entity, with plain
numeric filenames:

```
data/manuscripts/1.xml   data/persons/1.xml
data/places/1.xml        data/works/1.xml
```

Only files matching `^(\d+)\.xml$` are indexed; anything else (e.g.
`draft.xml`) is skipped with a warning.

## Usage

```bash
node tools/build-index.js [repoRoot] [--base <uri>]
```

- `repoRoot` — repository root to scan. Defaults to the script's `../`.
- `--base <uri>` — override the record-URI base. Defaults to
  `https://biblia-arabica.com`.

Examples:

```bash
node tools/build-index.js                     # scan this repo
node tools/build-index.js . --base https://biblia-arabica.com
```

Each run writes `index/index-manuscript.json`, `index/index-person.json`,
`index/index-place.json`, and `index/index-work.json` (pretty-printed, 2-space).
Per record it emits `id`, `uri` (`{base}/{manuscript|person|place|work}/{id}`),
`headword`, `altNames`, and the repo-relative `file` path.

Headword source per type:

| Type | Headword |
|---|---|
| person | text of the first `persName[@type="ba-headword"]/name` |
| place | text of the first `placeName[@type="ba-headword"]` |
| work | text of the first `title[@type="ba-headword"]` |
| manuscript | `msName`, falling back to `repository + " " + idno` |

Records with no extractable headword are **kept** with a placeholder
`"[no headword] {file}"` and a warning — they are never dropped silently. The
script exits non-zero if a non-empty data directory yields zero records.

## Keep the base URI in sync

The `--base` value (and its default) **must match `BA.config.baseUri`** in
`JS/ba/config.js`. If you change the project base URI, change it in both places
so record URIs stay consistent across the editors and the index.

## GitHub Action

`.github/workflows/build-index.yml` runs the script automatically on every push
to `main` that touches `data/**`, then commits any changes under `index/` back
to the branch as `github-actions[bot]`. It can also be run manually via
*workflow_dispatch*. Because GitHub Pages serves this repo, the editors fetch
the regenerated indexes by relative URL (`index/index-{type}.json`).

## Troubleshooting lookups

A newly added record does **not** become findable in the editors' autocomplete
immediately. Two things have to happen first:

1. **The index has to be rebuilt.** Autocomplete reads `index/index-{type}.json`,
   not the `data/**` TEI files. Run `node tools/build-index.js` locally, or let
   the GitHub Action run it on push to `main` (see above). Until the index is
   regenerated and committed/served, a brand-new record is invisible to every
   editor.
2. **The browser cache has to be refreshed.** The editors cache each index in
   `localStorage` for **1 hour** (see `BA.authority`), so even a freshly rebuilt
   index can stay hidden. Either click the **reload button** (the circular-arrow
   icon next to the Record-ID field — it re-fetches all four indexes, bypassing
   the cache, and reports the per-type record counts) or wait for the 1 h cache
   to expire.

If a lookup returns "No matches found" for a record you know exists, confirm both
steps: the index file actually contains the record (rerun the generator and check
`index/index-{type}.json`), **and** the editor's cache has been reloaded.

An empty `index/` (no `index-*.json` files) usually means the generator has never
run successfully. Note that the generator exits non-zero only when a data
directory holds real record files (`{id}.xml`) that all fail to yield a record;
a directory containing only `.gitkeep` is treated as legitimately empty and
produces a valid empty index.

## Zotero API key (bibliography lookup)

The editors' bibliography lookup queries the project's Zotero library. Because
GitHub Pages serves a static site, the API key in `JS/ba/config.js`
(`BA.config.zotero.apiKey`) ships in client code and is **visible to every site
visitor** — this is by design and unavoidable for a static site.

Therefore the key **must be read-only**. Verify at zotero.org → *Settings →
Keys* that this key grants read-only access scoped to the intended library, and
**rotate it immediately if it has write access**. The lookup stays hidden until
`BA.config.zotero.libraryId` is set to the numeric library id.
