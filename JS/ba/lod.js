// LOD autocomplete engine + provider registry.
// Any <input class="lod-autocomplete" data-lod="prov1 prov2"> gets a debounced,
// grouped dropdown. Selection stores label + URI, renders a badge (BA.form.attachBadge)
// and fires a bubbling "ba-lod-selected" CustomEvent with the result as detail.
// Everything on BA.lod. Classic script (no build step; loaded via <script>).

(function () {
  "use strict";

  var lod = window.BA.lod;

  // Copy of safeFetchJSON (JS/metadata-new.js line 2133).
  lod.safeFetchJSON = async function (url) {
    try {
      var res = await fetch(url);
      var text = await res.text();
      if (!res.ok) {
        console.warn("LOD request failed: " + res.status + " " + res.statusText);
        return null;
      }
      if (!text.trim()) return null;
      return JSON.parse(text);
    } catch (err) {
      console.warn("LOD fetch failed:", err);
      return null;
    }
  };

  // ---- Providers ----
  // Each: { label, search: async term -> [{label, uri, extra?}], enabled?: () => bool }
  // All searches fail soft to [].

  function wikidataSearch(term, fallbackDesc, typeItem) {
    var url = "https://www.wikidata.org/w/api.php?action=wbsearchentities" +
      "&search=" + encodeURIComponent(term) +
      "&language=en" + (typeItem ? "&type=item" : "") + "&format=json&origin=*";
    return lod.safeFetchJSON(url).then(function (data) {
      if (!data || !data.search) return [];
      return data.search.map(function (w) {
        return { label: w.label + " (" + (w.description || fallbackDesc) + ")", uri: w.concepturi };
      });
    });
  }

  function lobidSearch(term, filter) {
    var url = "https://lobid.org/gnd/search?q=" + encodeURIComponent(term) +
      "&filter=type:" + filter + "&size=10&format=json";
    return lod.safeFetchJSON(url).then(function (data) {
      if (!data || !data.member) return [];
      return data.member.map(function (doc) {
        var label = doc.preferredName || doc.gndIdentifier || doc.id;
        var b = doc.dateOfBirth && doc.dateOfBirth[0];
        var d = doc.dateOfDeath && doc.dateOfDeath[0];
        if (b || d) label += " (" + (b || "?") + "–" + (d || "?") + ")";
        return { label: label, uri: doc.id };
      });
    });
  }

  lod.providers = {
    "wikidata-place": {
      label: "Wikidata",
      search: function (t) { return wikidataSearch(t, "entity", true); }
    },
    "wikidata-person": {
      label: "Wikidata",
      search: function (t) { return wikidataSearch(t, "person", true); }
    },
    "wikidata-generic": {
      label: "Wikidata",
      search: function (t) { return wikidataSearch(t, "entity", true); }
    },
    "wikidata-lang": {
      label: "Wikidata",
      search: function (t) { return wikidataSearch(t, "language", false); }
    },
    "geonames": {
      label: "GeoNames",
      enabled: function () { return !!(window.BA.config && window.BA.config.geonamesUsername); },
      search: function (t) {
        var url = "https://secure.geonames.org/searchJSON?q=" + encodeURIComponent(t) +
          "&maxRows=10&username=" + encodeURIComponent(window.BA.config.geonamesUsername);
        return lod.safeFetchJSON(url).then(function (data) {
          // GeoNames rejects some requests with HTTP 200 and an in-band
          // { status: { message, value } } object and no `geonames` array.
          if (data && data.status) {
            console.warn("GeoNames error " + data.status.value + ": " + data.status.message);
            return [{ error: "GeoNames: " + data.status.message }];
          }
          if (!data || !data.geonames) return [];
          return data.geonames.map(function (g) {
            var label = g.name +
              (g.adminName1 ? ", " + g.adminName1 : "") +
              (g.countryName ? " (" + g.countryName + ")" : "");
            return {
              label: label,
              uri: "https://www.geonames.org/" + g.geonameId,
              extra: { lat: g.lat, lng: g.lng }
            };
          });
        });
      }
    },
    "gnd-person": {
      label: "GND",
      search: function (t) { return lobidSearch(t, "Person"); }
    },
    "gnd-place": {
      label: "GND",
      search: function (t) { return lobidSearch(t, "PlaceOrGeographicName"); }
    },
    "viaf-person": {
      label: "VIAF",
      search: function (t) {
        var url = "https://viaf.org/viaf/AutoSuggest?query=" + encodeURIComponent(t);
        return lod.safeFetchJSON(url).then(function (data) {
          if (!data || !data.result) return [];
          return data.result.map(function (item) {
            return { label: item.term, uri: "https://viaf.org/viaf/" + item.viafid };
          });
        }).catch(function () { return []; });
      }
    },
    "getty-script": {
      label: "Getty Vocabularies",
      search: function (t) {
        var query = "SELECT ?term ?termLabel WHERE { ?term a gvp:Concept; skos:prefLabel ?termLabel . " +
          'FILTER(CONTAINS(LCASE(?termLabel), "' + t.toLowerCase().replace(/"/g, "") + '")) } LIMIT 10';
        var url = "https://vocab.getty.edu/sparql.json?query=" + encodeURIComponent(query);
        return lod.safeFetchJSON(url).then(function (data) {
          if (!data || !data.results) return [];
          return data.results.bindings.map(function (r) {
            return { label: r.termLabel.value, uri: r.term.value };
          });
        });
      }
    },
    "zotero": {
      label: "Zotero",
      // Hidden until a libraryId is configured (like GeoNames).
      enabled: function () { return !!(window.BA.config.zotero && window.BA.config.zotero.libraryId); },
      search: function (t) {
        var z = window.BA.config.zotero;
        // api.zotero.org is CORS-enabled; the key goes in the query string so the
        // request stays "simple" (no custom header => no preflight).
        var base = "https://api.zotero.org/" + z.libraryType + "/" + z.libraryId +
          "/items?q=" + encodeURIComponent(t) +
          "&qmode=titleCreatorYear&limit=10&format=json&v=3&key=" + encodeURIComponent(z.apiKey);
        // Additionally request the formatted note citation. A CMOS-17 note
        // string becomes the bibl Title of publication in the editors.
        // NB: with format=json the item-data include token is "data" — "json" is
        // only valid for format=atom (Zotero returns "include=json is valid only
        // for format=atom" otherwise). "data" keeps item.data alongside citation.
        var style = (z.citationStyle || "chicago-fullnote-bibliography");
        var url = base + "&include=data,citation&style=" + encodeURIComponent(style);

        // Strip an HTML citation fragment to plain text WITHOUT innerHTML injection,
        // then drop a trailing URL (Zotero appends the item URL to the note) while
        // keeping the closing period that is part of the CMOS note form.
        function plainCitation(html) {
          if (!html) return "";
          var text = new DOMParser().parseFromString(html, "text/html").body.textContent.trim();
          text = text.replace(/[,.;]?\s*https?:\/\/\S+\s*$/i, ".");
          return text.replace(/\.\.+$/, ".");
        }

        function mapItems(data, withCitation) {
          return data.map(function (item) {
            var d = item.data || {};
            var meta = item.meta || {};
            var year = (meta.parsedDate && (String(meta.parsedDate).match(/\d{4}/) || [])[0]) || "n.d.";
            var creator = meta.creatorSummary || "?";
            var uri = (item.links && item.links.alternate && item.links.alternate.href) ||
              ("https://www.zotero.org/" + z.libraryType + "/" + z.libraryId + "/items/" + item.key);
            var citation = "";
            if (withCitation) {
              if (item.citation) citation = plainCitation(item.citation);
              else console.warn("Zotero: no citation for item " + item.key + "; using short title");
            }
            return {
              // Dropdown label unchanged: creator (year): short title.
              label: creator + " (" + year + "): " + (d.title || ""),
              uri: uri,
              extra: { zoteroKey: item.key, title: d.title || "", citation: citation }
            };
          });
        }

        // Try the citation request; on a rejected style id (HTTP 400) or any
        // failure, warn once and fall back to the plain search (short titles).
        return fetch(url).then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        }).then(function (text) {
          var data = text.trim() ? JSON.parse(text) : null;
          if (!Array.isArray(data)) return [];
          return mapItems(data, true);
        }).catch(function (err) {
          console.warn("Zotero citation request failed (" + err.message +
            "); falling back to short titles");
          return lod.safeFetchJSON(base).then(function (plain) {
            return Array.isArray(plain) ? mapItems(plain, false) : [];
          });
        });
      }
    }
    // "local-person" / "local-place" / "local-work" / "local-manuscript"
    // are registered by JS/ba/authority.js.
  };

  // Fetch a single Zotero item as TEI (a <listBibl> with one biblStruct).
  // Returns the response text, or null on failure. Exposed for the Data-Collection
  // full-record view; the editors' simple bibl (title/citedRange/ptr) is unaffected.
  lod.fetchZoteroTEI = function (key) {
    var z = window.BA.config.zotero;
    if (!z || !z.libraryId) return Promise.resolve(null);
    var url = "https://api.zotero.org/" + z.libraryType + "/" + z.libraryId +
      "/items/" + encodeURIComponent(key) + "?format=tei&v=3&key=" + encodeURIComponent(z.apiKey);
    return fetch(url).then(function (res) {
      if (!res.ok) { console.warn("Zotero TEI request failed: " + res.status); return null; }
      return res.text();
    }).catch(function (err) { console.warn("Zotero TEI fetch failed:", err); return null; });
  };

  var warnedUnknown = {};
  function providersFor(field) {
    var ids = (field.dataset.lod || "").trim().split(/\s+/).filter(Boolean);
    var active = [];
    ids.forEach(function (id) {
      var p = lod.providers[id];
      if (!p) {
        if (!warnedUnknown[id]) {
          console.warn('BA.lod: unknown provider "' + id + '" (skipped)');
          warnedUnknown[id] = true;
        }
        return;
      }
      if (p.enabled && !p.enabled()) return;
      active.push(p);
    });
    return active;
  }

  // ---- Dropdown (adapted from showDropdown, JS/metadata-new.js line 2212) ----

  var activeDropdown = null;

  function closeDropdown() {
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
    }
  }
  lod.closeDropdown = closeDropdown;

  // groups: [{ label, items: [{label, uri, extra?}] }]
  function showDropdown(field, groups, loading) {
    closeDropdown();

    var dropdown = document.createElement("div");
    dropdown.className = "lod-dropdown border bg-light";
    dropdown.style.position = "absolute";
    dropdown.style.zIndex = 9999;
    dropdown.style.maxHeight = "260px";
    dropdown.style.overflowY = "auto";

    var rect = field.getBoundingClientRect();
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    dropdown.style.width = rect.width + "px";
    dropdown.style.left = rect.left + "px";
    dropdown.style.top = (rect.bottom + scrollTop) + "px";

    var totalItems = groups.reduce(function (n, g) { return n + g.items.length; }, 0);

    if (loading) {
      dropdown.innerHTML = '<div class="lod-item p-1 text-muted">Loading...</div>';
    } else if (!totalItems) {
      dropdown.innerHTML = '<div class="lod-item p-1 text-muted">No matches found</div>';
    } else {
      groups.forEach(function (g) {
        if (!g.items.length) return;
        var header = document.createElement("div");
        header.className = "lod-group-header p-1 small fw-bold text-secondary";
        header.textContent = g.label;
        dropdown.appendChild(header);

        g.items.slice(0, 8).forEach(function (r) {
          // Error marker rows (e.g. GeoNames in-band status): show the message
          // in red and make it non-clickable so the cause is visible.
          if (r.error) {
            var errItem = document.createElement("div");
            errItem.className = "lod-item p-1 ps-2 text-danger";
            errItem.textContent = r.error;
            dropdown.appendChild(errItem);
            return;
          }
          var item = document.createElement("div");
          item.className = "lod-item p-1 ps-2";
          item.textContent = r.label;
          item.style.cursor = "pointer";
          item.addEventListener("click", function () {
            field.value = r.label;
            field.dataset.lodUri = r.uri;
            window.BA.form.attachBadge(field, r.uri, g.label);
            field.dispatchEvent(new CustomEvent("ba-lod-selected", { detail: r, bubbles: true }));
            closeDropdown();
          });
          dropdown.appendChild(item);
        });
      });
    }

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;
  }
  lod.showDropdown = showDropdown; // exposed for tests

  // Outside-click closes the dropdown (one global listener).
  document.addEventListener("click", function (ev) {
    if (!activeDropdown) return;
    if (!activeDropdown.contains(ev.target) &&
        !(ev.target.classList && ev.target.classList.contains("lod-autocomplete"))) {
      closeDropdown();
    }
  });

  // ---- Debounced input listener (fixes per-keystroke firing of the old code) ----

  var debounceTimer = null;
  var DEBOUNCE_MS = 300;

  document.addEventListener("input", function (e) {
    var field = e.target;
    if (!field.classList || !field.classList.contains("lod-autocomplete")) return;

    if (debounceTimer) clearTimeout(debounceTimer);

    var query = field.value.trim();
    if (query.length < 3) {
      closeDropdown();
      return;
    }

    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      var provs = providersFor(field);
      if (!provs.length) return;

      showDropdown(field, [], true); // loading state

      Promise.all(provs.map(function (p) {
        var result;
        try {
          result = Promise.resolve(p.search(query));
        } catch (err) {
          console.warn("BA.lod provider threw:", err);
          result = Promise.resolve([]);
        }
        return result.then(
          function (items) { return { label: p.label, items: items || [] }; },
          function (err) {
            console.warn("BA.lod provider failed:", err);
            return { label: p.label, items: [] };
          }
        );
      })).then(function (groups) {
        // Field may have changed meanwhile; only render if still current.
        if (field.value.trim() === query) showDropdown(field, groups, false);
      });
    }, DEBOUNCE_MS);
  });
})();
