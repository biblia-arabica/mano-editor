# MANO for Biblia Arabica

This is a fork of the editor and data collection in **([MANO Project](https://github.com/mano-project/mano-project.github.io))**.

**MANO for Biblia Arabica** allows users to edit four different TEI entities adapted for the Biblia Arabica project and create links between them. Each entity is edited on its own page and exported as one TEI file per record:

- **Manuscript Editor** — `editor.html` → `data/manuscripts/{id}.xml`
- **Person Editor** — `person-editor.html` → `data/persons/{id}.xml`
- **Place Editor** — `place-editor.html` → `data/places/{id}.xml`
- **Work Editor** — `work-editor.html` → `data/works/{id}.xml`

In addition, identifiers can be pulled from Geonames, Wikidata, and GND. Bibliographic references can be pulled from Zotero.

Shared machinery lives in `JS/ba/` (config, UI text, XML utils, form engine,
LOD autocomplete, authority index, TEI header, per-entity editors, validation).
Cross-record links (author, scribe, place, work, …) autocomplete against the
local **authority index** in `index/index-{type}.json`, regenerated from the
TEI files by `tools/build-index.js` (run locally or via the GitHub Action).

**Config step:** the project base URI is set once in `JS/ba/config.js`
(`BA.config.baseUri`) and must match the `--base` used by `tools/build-index.js`.
To enable the optional GeoNames lookup in the Place Editor, set
`BA.config.geonamesUsername`.

