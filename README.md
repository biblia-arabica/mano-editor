# MANO - Manuscripts Online  
**A collaborative platform for digital manuscript studies**

## Biblia Arabica editors

This repository also hosts a four-entity TEI editor suite adapted for the
Biblia Arabica project. Each entity is edited on its own page and exported as
one TEI file per record:

- **Manuscript Editor** — `editor.html` → `data/manuscripts/{id}.xml`
- **Person Editor** — `person-editor.html` → `data/persons/{id}.xml`
- **Place Editor** — `place-editor.html` → `data/places/{id}.xml`
- **Work Editor** — `work-editor.html` → `data/works/{id}.xml`

Shared machinery lives in `JS/ba/` (config, UI text, XML utils, form engine,
LOD autocomplete, authority index, TEI header, per-entity editors, validation).
Cross-record links (author, scribe, place, work, …) autocomplete against the
local **authority index** in `index/index-{type}.json`, regenerated from the
TEI files by `tools/build-index.js` (run locally or via the GitHub Action).

**Config step:** the project base URI is set once in `JS/ba/config.js`
(`BA.config.baseUri`) and must match the `--base` used by `tools/build-index.js`.
To enable the optional GeoNames lookup in the Place Editor, set
`BA.config.geonamesUsername`.

---


This is the **website of the MANO Project**, hosted on GitHub Pages at:  
**[https://mano-project.github.io](https://mano-project.github.io)**  

The website provides access to all MANO tools and collections, including:  
- **Resources** → shared teaching materials from contributors  
- **Metadata Editor** → tool for describing manuscripts according to the TEI P5 guidelines  
- **Metadata Collection** → searchable collection of manuscript descriptions  
- **Transcription Viewer** → interface for viewing and working with XML transcriptions  
