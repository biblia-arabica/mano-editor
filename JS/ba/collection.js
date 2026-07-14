// Data Collection browser. Drives the landing page (record counts) and
// the four per-entity pages (collection-{persons|places|works|manuscripts}.html).
// Reads records from this repo's index-*.json. Each listing row links into the
// matching editor: "View record" opens the editor's read-only view mode
// (?view=), "Open in editor" opens it editable (?load=). The full-record preview
// IS the editor form — there is no separate renderer here (R5).
// Classic script (no build step; loaded via <script>). Everything
// self-contained; depends on BA.config, BA.util, BA.authority.

(function () {
  "use strict";

  var A = window.BA.authority;
  var U = window.BA.util;
  function cfg() { return window.BA.config; }
  function esc(s) { return U.esc(s == null ? "" : String(s)); }

  // Index type (singular) -> per-entity page + data subfolder + display label +
  // matching editor page (used by the View / Open-in-editor deep links).
  var TYPES = {
    person: { page: "collection-persons.html", dir: "data/persons", label: "Persons", one: "Person", editor: "person-editor.html" },
    place: { page: "collection-places.html", dir: "data/places", label: "Places", one: "Place", editor: "place-editor.html" },
    work: { page: "collection-works.html", dir: "data/works", label: "Works", one: "Work", editor: "work-editor.html" },
    manuscript: { page: "collection-manuscripts.html", dir: "data/manuscripts", label: "Manuscripts", one: "Manuscript", editor: "editor.html" }
  };
  var ALL = ["manuscript", "person", "place", "work"];

  // Deep link into the matching editor's edit mode (?load= import path).
  function editorHref(type, id) {
    var meta = TYPES[type];
    return (meta && meta.editor ? meta.editor : "editor.html") + "?load=" + encodeURIComponent(id);
  }

  // Deep link into the matching editor's read-only view mode (?view=).
  function viewHref(type, id) {
    var meta = TYPES[type];
    return (meta && meta.editor ? meta.editor : "editor.html") + "?view=" + encodeURIComponent(id);
  }

  // ---- shared helpers ----

  function repoConfigured() {
    var r = cfg().repoUrl;
    return !!r && r !== "CHANGE-ME";
  }

  function fold(s) {
    return (A.fold ? A.fold(s) : (s || "").toLowerCase());
  }

  // ---- per-entity page controller ----

  function initEntityPage(type) {
    var meta = TYPES[type];
    if (!meta) { console.warn("BA.collection: unknown collection type " + type); return; }

    // Legacy deep link collection-{type}.html?id={n} forwards to the editor's
    // view mode (keeps every link minted since R09 working).
    var deepId = new URLSearchParams(location.search).get("id");
    if (deepId) { location.replace(viewHref(type, deepId)); return; }

    // Contribute button.
    var contribute = document.getElementById("contributeBtn");
    if (contribute) {
      if (repoConfigured()) {
        contribute.href = cfg().repoUrl.replace(/\/+$/, "") + "/tree/main/" + meta.dir;
        contribute.classList.remove("d-none");
      } else {
        contribute.classList.add("d-none");
      }
    }

    var listing = document.getElementById("listing");
    var filterInput = document.getElementById("filterInput");
    var records = [];

    function renderListing(recs) {
      if (!recs.length) {
        listing.innerHTML = '<div class="alert alert-info" role="alert">No records yet — ' +
          (repoConfigured()
            ? '<a href="' + esc(cfg().repoUrl.replace(/\/+$/, "") + "/tree/main/" + meta.dir) + '" target="_blank" rel="noopener">contribute the first one</a>.'
            : "contribute the first one.") +
          "</div>";
        return;
      }
      var rows = recs.map(function (r) {
        var alt = (r.altNames || []).join(", ");
        return '<tr role="button" data-id="' + esc(r.id) + '">' +
          "<td>" + esc(r.headword) + "</td>" +
          "<td>" + esc(r.id) + "</td>" +
          '<td class="text-muted">' + esc(alt) + "</td>" +
          '<td class="text-end text-nowrap">' +
          '<a class="btn btn-sm btn-outline-secondary btn-view me-1" href="' + esc(viewHref(type, r.id)) +
          '" title="View record" aria-label="View record"><i class="bi bi-eye"></i></a>' +
          '<a class="btn btn-sm btn-outline-primary btn-edit" href="' + esc(editorHref(type, r.id)) +
          '" title="Open in editor" aria-label="Open in editor"><i class="bi bi-pencil"></i></a>' +
          "</td></tr>";
      }).join("");
      listing.innerHTML =
        '<div class="table-responsive"><table class="table table-hover align-middle">' +
        "<thead><tr><th>Headword</th><th>ID</th><th>Alternative names</th><th></th></tr></thead>" +
        "<tbody>" + rows + "</tbody></table></div>";
      // Whole-row click opens the record's view mode, except clicks on the action
      // links (which navigate via their own href).
      Array.prototype.forEach.call(listing.querySelectorAll("tbody tr"), function (tr) {
        tr.addEventListener("click", function (e) {
          if (e.target.closest && e.target.closest("a, button")) return;
          location.href = viewHref(type, tr.getAttribute("data-id"));
        });
      });
    }

    function applyFilter() {
      var needle = fold(filterInput ? filterInput.value : "");
      if (!needle) { renderListing(records); return; }
      var filtered = records.filter(function (r) {
        if (fold(r.headword).indexOf(needle) !== -1) return true;
        return (r.altNames || []).some(function (a) { return fold(a).indexOf(needle) !== -1; });
      });
      renderListing(filtered);
    }

    if (filterInput) filterInput.addEventListener("input", applyFilter);

    // Load all types so cross-record refs resolve in the editors' view mode,
    // then render the listing.
    Promise.all(ALL.map(function (t) { return A.load(t); })).then(function () {
      return A.load(type);
    }).then(function (recs) {
      records = recs || [];
      renderListing(records);
    });
  }

  // ---- landing page controller ----

  function initLanding() {
    ALL.forEach(function (t) {
      var el = document.getElementById("count-" + t);
      if (!el) return;
      A.load(t).then(function (recs) {
        el.textContent = recs.length + " record" + (recs.length === 1 ? "" : "s");
      });
    });
  }

  // ---- bootstrap ----

  document.addEventListener("DOMContentLoaded", function () {
    var body = document.body;
    var type = body.getAttribute("data-collection-type");
    if (type) { initEntityPage(type); }
    else if (body.hasAttribute("data-collection-landing")) { initLanding(); }
  });
})();
