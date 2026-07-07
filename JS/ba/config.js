// BA namespace + project configuration.
// Load order on every editor page: config.js, ui-text.js, xml-utils.js,
// form-engine.js, lod.js, authority.js, tei-header.js, {entity}-editor.js.

window.BA = {
  config: {
    projectTitle: "Biblia Arabica: Critical edition and comprehensive digital inventory of Arabic Old Testament manuscripts and their paratexts",

    // Single switch for all record URIs (header idno, ref attributes, index URIs).
    baseUri: "https://biblia-arabica.com",

    entityPaths: { manuscript: "manuscript", person: "person", place: "place", work: "work" },

    // Data lives in this repository (relative to site root).
    dataDirs: {
      manuscript: "data/manuscripts",
      person: "data/persons",
      place: "data/places",
      work: "data/works"
    },
    indexPath: "index", // relative URL: index/index-person.json etc.

    // Live index rebuild. When enabled, authority lookups rebuild the
    // relevant index client-side from the repository's data/ folder (one GitHub
    // contents listing + one fetch per record, cached for ttlMs), instead of the
    // prebuilt index/*.json. Keep OFF once the record count grows — the prebuilt
    // index is a single request instead of N+1. See documentation.html.
    authorityLive: { enabled: false, ttlMs: 60000 },

    // The data repository's GitHub URL (e.g. https://github.com/USER/mano-editor),
    // used for the Data Collection "Contribute to Collection" links.
    // While "CHANGE-ME", the Contribute buttons stay hidden (same pattern as
    // geonamesUsername / Zotero libraryId).
    repoUrl: "https://github.com/biblia-arabica/mano-editor",

    // Submit-to-repository target. {owner, repo} are derived from repoUrl
    // via BA.github.repoInfo(); only the branch is configurable here.
    github: { branch: "main" },

    geonamesUsername: "bibliaarabica", // empty => GeoNames lookup hidden (place editor)

    // Zotero bibliography lookup. apiKey ships in client code, so it MUST
    // be a read-only key scoped to the library (see tools/README.md caveat).
    // libraryId empty => the Zotero lookup is hidden (same pattern as GeoNames).
    zotero: {
      apiKey: "wXeD8P9OJ8ELFRW9JOoeRZdn", // read-only key — visible to every site visitor
      libraryType: "groups",              // "groups" or "users"
      libraryId: "538215",                      // CHANGE-ME: numeric library id; empty => feature hidden
      // CSL style id for the note citation used as a bibl Title of publication
      // Any style id from the Zotero style repository works. Use the
      // FULL-note Chicago 17th style so each reference is complete (author,
      // title, place/publisher/year, pages) rather than the shortened note form.
      // ("chicago-note-bibliography" shortens to author + short title; the
      // "-17th-edition" suffix is the archived 16th-edition id and is rejected.)
      citationStyle: "chicago-fullnote-bibliography"
    },

    // Team list for the shared teiHeader and revisionDesc/change/@who.
    // refs copied from the editor elements in templates/persons-fulltemplate.xml.
    editors: [
      {
        id: "rvollandt",
        name: "Ronny Vollandt",
        role: "general",
        refs: [
          "https://www.naher-osten.uni-muenchen.de/personen/professoren/ronny_vollandt/index.html",
          "http://orcid.org/0000-0002-1702-2981",
          "https://viaf.org/viaf/309581349"
        ]
      },
      {
        id: "ngibson",
        name: "Nathan P. Gibson",
        role: "general",
        refs: [
          "https://www.fb06.uni-frankfurt.de/137634647/Prof__Dr__Nathan_P__Gibson?",
          "http://orcid.org/0000-0003-0786-8075",
          "https://viaf.org/viaf/59147905242279092527"
        ]
      },
      {
        id: "mmoliere",
        name: "Maximilian de Molière",
        role: "contributor",
        refs: [
          "https://www.naher-osten.uni-muenchen.de/personen/wiss_ma/maximilian_de_moliere/index.html",
          "https://orcid.org/0000-0002-2168-8655",
          "http://viaf.org/viaf/65156495392717561393"
        ]
      },
      {
        id: "hibrahim",
        name: "Habib Ibrahim",
        role: "contributor",
        refs: [
          "http://viaf.org/viaf/156150565763506252798",
          "https://orcid.org/0000-0002-1667-9973"
        ]
      },
      {
        id: "ptarras",
        name: "Peter Tarras",
        role: "contributor",
        refs: [
          "https://www.naher-osten.uni-muenchen.de/personen/wiss_ma/peter-tarras/index.html",
          "https://orcid.org/0009-0009-1776-3171",
          "http://viaf.org/viaf/37173908292419952891"
        ]
      },
      {
        id: "lgzella",
        name: "Lea Gzella",
        role: "contributor",
        refs: [
          "https://www.naher-osten.uni-muenchen.de/personen/doktoranden/lea_gzella_rasche/index.html",
          "http://viaf.org/viaf/2912176725960924980001"
        ]
      },
      {
        id: "ffrigo",
        name: "Filippo Frigo",
        role: "contributor",
        refs: [
          "https://www.naher-osten.uni-muenchen.de/personen/doktorierende/filippo_frigo/index.html"
        ]
      },
      {
        id: "nibrahimi",
        name: "Nargez Ibrahimi",
        role: "contributor",
        refs: [
          "https://www.naher-osten.uni-muenchen.de/personen/hilfskraefte/nargez_ibrahimi/index.html"
        ]
      },
      {
        id: "jthalmann",
        name: "Jessica Thalmann",
        role: "contributor",
        refs: [
          "https://www.naher-osten.uni-muenchen.de/personen/hilfskraefte/thalmann1/index.html"
        ]
      }
    ],

    // Placeholder — ui-text.js (loaded next) overwrites this with BA.uiText.vocab.
    vocab: {},

    // Fixed publicationStmt content (matches the templates).
    licence: {
      target: "http://creativecommons.org/licenses/by/3.0/",
      text: "Distributed under a Creative Commons Attribution 4.0 International (CC BY 4.0) License."
    },
    authority: {
      text: "Biblia Arabica: Critical edition and comprehensive digital inventory of Arabic Old Testament manuscripts and their paratexts",
      target: "https://biblia-arabica.com/"
    },

    // teiHeader/titleStmt project block. sponsors + funders take
    // { ref, name, nameDe? } — nameDe adds a German <orgName xml:lang="de"> in
    // parentheses; omit it for a single-language entry. principals take { ref, name }.
    teiHeader: {
      sponsors: [
        { ref: "https://www.uni-muenchen.de", name: "Ludwig Maximilian University of Munich", nameDe: "Ludwig-Maximilians-Universität München" },
        { ref: "http://www.naher-osten.uni-muenchen.de", name: "Institute of Near and Middle Eastern Studies", nameDe: "Institut für den Nahen und Mittleren Osten" },
        { ref: "https://www.uni-frankfurt.de/", name: "Goethe University Frankfurt", nameDe: "Goethe-Universität Frankfurt" },
        { ref: "https://www.fb06.uni-frankfurt.de/42495474/Profil", name: "Protestant Theology, Religious Studies", nameDe: "Fachbereich Ev. Theologie, Religionswissenschaft" }
      ],
      funders: [
        { ref: "https://badw.de/en/the-academy.html", name: "Bavarian Academy of Sciences and Humanities", nameDe: "Bayerische Akademie der Wissenschaften" },
        { ref: "https://www.adwmainz.de/startseite.html", name: "Academy of Sciences and Literature in Mainz", nameDe: "Akademie der Wissenschaften und der Literatur | Mainz" }
      ],
      principals: [
        { ref: "#rvollandt", name: "Ronny Vollandt" },
        { ref: "#ngibson", name: "Nathan Gibson" }
      ]
    }
  },

  // Namespaces filled by the other JS/ba modules.
  util: {},
  form: {},
  lod: {},
  authority: {},
  header: {},
  github: {}
};

Object.freeze(window.BA.config.entityPaths);
