// Data Collection browser. Drives the landing page (record counts) and
// the four per-entity pages (collection-{persons|places|works|manuscripts}.html).
// Reads records from this repo's index-*.json + data/**.xml — no JSON record
// intermediates. Full-record views are rendered natively from TEI using the
// same q/qa paths as the editors' import functions.
// Classic script (no build step; loaded via <script>). Everything
// self-contained; depends on BA.config, BA.util, BA.authority.

(function () {
  "use strict";

  var A = window.BA.authority;
  var U = window.BA.util;
  function cfg() { return window.BA.config; }
  function esc(s) { return U.esc(s == null ? "" : String(s)); }

  // Index type (singular) -> per-entity page + data subfolder + display label +
  // matching editor page ("Open in editor" deep link).
  var TYPES = {
    person: { page: "collection-persons.html", dir: "data/persons", label: "Persons", one: "Person", editor: "person-editor.html" },
    place: { page: "collection-places.html", dir: "data/places", label: "Places", one: "Place", editor: "place-editor.html" },
    work: { page: "collection-works.html", dir: "data/works", label: "Works", one: "Work", editor: "work-editor.html" },
    manuscript: { page: "collection-manuscripts.html", dir: "data/manuscripts", label: "Manuscripts", one: "Manuscript", editor: "editor.html" }
  };
  var ALL = ["manuscript", "person", "place", "work"];

  // Deep link into the matching editor (?load= import path).
  function editorHref(type, id) {
    var meta = TYPES[type];
    return (meta && meta.editor ? meta.editor : "editor.html") + "?load=" + encodeURIComponent(id);
  }

  // ---- shared render helpers ----

  function repoConfigured() {
    var r = cfg().repoUrl;
    return !!r && r !== "CHANGE-ME";
  }

  function fold(s) {
    return (A.fold ? A.fold(s) : (s || "").toLowerCase());
  }

  // A definition row: label + value HTML, emitted only when value is non-empty.
  function row(label, valueHtml) {
    if (valueHtml === "" || valueHtml == null) return "";
    return '<div class="mb-2"><span class="fw-semibold">' + esc(label) + ':</span> ' + valueHtml + "</div>";
  }

  function section(title, innerHtml) {
    if (!innerHtml) return "";
    return '<div class="mb-4"><h5 class="border-bottom pb-1">' + esc(title) + "</h5>" + innerHtml + "</div>";
  }

  function extLink(uri, text) {
    if (!uri) return esc(text || "");
    return '<a href="' + esc(uri) + '" target="_blank" rel="noopener">' + esc(text || uri) + "</a>";
  }

  // Cross-record ref: internal link into the collection when it resolves in the
  // index, else the raw URI as an external link (decision).
  function refLink(targetType, ref, text) {
    if (!ref) return esc(text || "");
    var rec = A.resolve(targetType, ref);
    if (rec && TYPES[targetType]) {
      return '<a href="' + TYPES[targetType].page + "?id=" + esc(rec.id) + '">' +
        esc(text || rec.headword) + "</a>";
    }
    return extLink(ref, text || ref);
  }

  function inferSubtype(uri) {
    uri = uri || "";
    if (uri.indexOf("d-nb.info") !== -1) return "gnd";
    if (uri.indexOf("viaf.org") !== -1) return "viaf";
    if (uri.indexOf("wikidata.org") !== -1) return "wiki";
    if (uri.indexOf("isni.org") !== -1) return "isni";
    return "";
  }

  // Uppercase source label first, then the link.
  function idnoLink(uri, subtype) {
    var st = subtype || inferSubtype(uri);
    var label = st ? st.toUpperCase() : "URI";
    return '<div class="mb-1"><span class="badge bg-secondary me-2">' + esc(label) + "</span>" +
      extLink(uri, uri) + "</div>";
  }

  function dateText(el) {
    if (!el) return "";
    var when = U.attr(el, "when");
    if (when) return when;
    var from = U.attr(el, "from"), to = U.attr(el, "to");
    if (from || to) return (from || "?") + " – " + (to || "?");
    return U.text(el);
  }

  // Shared header block present in every record type.
  function renderShared(doc) {
    var idno = U.text(U.q(doc, "publicationStmt/idno[@type='URI']"));
    var titleA = U.q(doc, "titleStmt/title[@level='a']");
    var status = U.attr(U.q(doc, "revisionDesc"), "status");
    var parts = [];
    parts.push(row("Record URI", idno ? extLink(idno, idno) : ""));
    parts.push(row("Title", esc(U.text(titleA))));
    parts.push(row("Status", esc(status)));

    var changes = U.qa(doc, "revisionDesc/change").map(function (ch) {
      var who = (ch.getAttribute("who") || "").replace(/^#/, "");
      var when = ch.getAttribute("when") || "";
      var txt = U.text(ch);
      var meta = [who, when].filter(Boolean).join(", ");
      return "<li>" + (meta ? "<span class=\"text-muted\">" + esc(meta) + "</span>" : "") +
        (txt ? " — " + esc(txt) : "") + "</li>";
    }).join("");
    var history = changes ? '<ul class="mb-0">' + changes + "</ul>" : "";

    return section("Record", parts.join("")) + section("Change history", history);
  }

  // ---- per-type body renderers (paths copied from the editors' import code) ----

  function renderPerson(doc) {
    var out = "";
    var person = U.q(doc, "person");
    if (!person) return out;

    // Names grouped by type, headword first.
    var names = U.qa(doc, "person/persName").map(function (pn) {
      var type = pn.getAttribute("type") || "";
      if (type === "majlis-headword") type = "ba-headword";
      return {
        name: U.text(U.q(pn, "name") || pn),
        type: type,
        lang: pn.getAttribute("xml:lang") || "",
        source: pn.getAttribute("source") || ""
      };
    });
    function rank(t) { return t === "ba-headword" ? 0 : 1; }
    names.sort(function (a, b) { return rank(a.type) - rank(b.type); });
    var nameHtml = names.map(function (n) {
      var meta = [n.type, n.lang].filter(Boolean).join(", ");
      return "<li>" + esc(n.name) + (meta ? ' <span class="text-muted">(' + esc(meta) + ")</span>" : "") + "</li>";
    }).join("");
    out += section("Names", nameHtml ? '<ul class="mb-0">' + nameHtml + "</ul>" : "");

    // Note.
    out += section("Note", row("Note", esc(U.text(U.q(doc, "person/note")))));

    // State / label.
    var stateLabel = U.q(doc, "person/state/label");
    out += section("State", row("Label", esc(U.text(stateLabel))));

    // Life events.
    var life = "";
    ["birth", "death", "floruit"].forEach(function (kind) {
      U.qa(doc, "person/" + kind).forEach(function (ev) {
        var d = dateText(U.q(ev, "date"));
        var pl = U.q(ev, "placeName");
        var place = pl ? refLink("place", U.attr(pl, "ref"), U.text(pl) || U.attr(pl, "ref")) : "";
        var val = [d, place].filter(Boolean).join(" · ");
        life += row(kind.charAt(0).toUpperCase() + kind.slice(1), val);
      });
    });
    out += section("Life", life);

    // Attributes.
    var attrs = "";
    attrs += row("Sex", esc(U.attr(U.q(doc, "person/sex"), "value") || U.text(U.q(doc, "person/sex"))));
    attrs += row("Faith", esc(U.text(U.q(doc, "person/faith"))));
    U.qa(doc, "person/occupation").forEach(function (o) {
      attrs += row("Occupation", esc(o.getAttribute("type") || U.text(o)));
    });
    U.qa(doc, "person/residence").forEach(function (r) {
      var pl = U.q(r, "placeName");
      attrs += row("Residence", pl ? refLink("place", U.attr(pl, "ref"), U.text(pl) || U.attr(pl, "ref")) : "");
    });
    out += section("Attributes", attrs);

    // Bibliography.
    out += section("Bibliography", renderBibl(U.qa(doc, "person/bibl")));

    // Identifiers (label before link, uppercase).
    var idnos = U.qa(doc, "person/idno[@type='URI']").map(function (idno) {
      return idnoLink(U.text(idno), idno.getAttribute("subtype") || "");
    }).join("");
    out += section("Identifiers", idnos);

    return out;
  }

  function renderPlace(doc) {
    var out = "";
    if (!U.q(doc, "place")) return out;

    var names = U.qa(doc, "place/placeName").map(function (pn) {
      var meta = [pn.getAttribute("type") || "", pn.getAttribute("xml:lang") || ""].filter(Boolean).join(", ");
      return "<li>" + esc(U.text(pn)) + (meta ? ' <span class="text-muted">(' + esc(meta) + ")</span>" : "") + "</li>";
    }).join("");
    out += section("Names", names ? '<ul class="mb-0">' + names + "</ul>" : "");

    out += section("Description", row("Description", esc(U.text(U.q(doc, "place/desc/quote")))));

    // Location.
    var loc = "";
    var geo = U.q(doc, "place/location/geo");
    if (geo) {
      var coords = U.text(geo).split(/\s+/).filter(Boolean);
      var lat = coords[0], lng = coords[1];
      var geoText = coords.join(", ");
      var osm = (lat && lng)
        ? ' (' + extLink("https://www.osm.org/?mlat=" + encodeURIComponent(lat) + "&mlon=" + encodeURIComponent(lng), "OpenStreetMap") + ")"
        : "";
      loc += row("Coordinates", esc(geoText) + osm);
    }
    var st = U.q(doc, "place/location/settlement");
    if (st) loc += row("Settlement", refLink("place", U.attr(st, "ref"), U.text(st) || U.attr(st, "ref")));
    var rg = U.q(doc, "place/location/region");
    if (rg) loc += row("Region", refLink("place", U.attr(rg, "ref"), U.text(rg) || U.attr(rg, "ref")));
    out += section("Location", loc);

    var idnos = U.qa(doc, "place/idno[@type='URI']").map(function (idno) {
      return idnoLink(U.text(idno), idno.getAttribute("subtype") || "");
    }).join("");
    out += section("Identifiers", idnos);

    out += section("Bibliography", renderBibl(U.qa(doc, "place/bibl")));

    return out;
  }

  function renderWork(doc) {
    var out = "";
    var body = U.q(doc, "body");
    var root = null;
    if (body) {
      root = Array.prototype.filter.call(body.children, function (ch) { return ch.localName === "bibl"; })[0] || null;
    }
    if (!root) return out;

    // Titles by type.
    var titles = U.qa(root, "title").filter(function (t) { return t.parentNode === root; }).map(function (t) {
      var type = t.getAttribute("type") || "";
      if (type === "majlis-headword") type = "ba-headword";
      var meta = [type, t.getAttribute("xml:lang") || ""].filter(Boolean).join(", ");
      return "<li>" + esc(U.text(t)) + (meta ? ' <span class="text-muted">(' + esc(meta) + ")</span>" : "") + "</li>";
    }).join("");
    out += section("Titles", titles ? '<ul class="mb-0">' + titles + "</ul>" : "");

    // Authors / persNames (linked to person collection).
    var people = "";
    Array.prototype.forEach.call(root.children, function (ch) {
      if (ch.localName === "author") {
        people += row("Author", refLink("person", ch.getAttribute("ref") || "", U.text(ch) || ch.getAttribute("ref")));
      } else if (ch.localName === "persName") {
        var role = ch.getAttribute("role") || "";
        people += row(role || "Person", refLink("person", ch.getAttribute("ref") || "", U.text(ch) || ch.getAttribute("ref")));
      }
    });
    out += section("Authors", people);

    // Language / script / date.
    var meta = "";
    var tl = U.q(root, "textLang");
    if (tl) {
      var langs = [tl.getAttribute("mainLang") || ""].concat((tl.getAttribute("otherLangs") || "").split(/\s+/)).filter(Boolean);
      meta += row("Language", esc(langs.join(", ")));
    }
    meta += row("Script", esc(U.text(U.q(root, "term"))));
    meta += row("Date", esc(dateText(U.q(root, "date"))));
    out += section("Details", meta);

    // Incipit / explicit / quotes.
    var textParts = "";
    textParts += row("Incipit", esc(U.text(U.q(root, "incipit"))));
    textParts += row("Explicit", esc(U.text(U.q(root, "explicit"))));
    U.qa(root, "quote").filter(function (q) { return q.parentNode === root; }).forEach(function (q) {
      textParts += row("Quote", esc(U.text(q)));
    });
    out += section("Text", textParts);

    // Notes.
    var notes = "";
    U.qa(root, "note").filter(function (n) { return n.parentNode === root; }).forEach(function (n) {
      notes += row("Note", esc(U.text(n)));
    });
    out += section("Notes", notes);

    // Bibliography (nested bibl).
    out += section("Bibliography", renderBibl(U.qa(root, "bibl").filter(function (b) { return b.parentNode === root; })));

    return out;
  }

  function renderManuscript(doc) {
    var out = "";
    var msDesc = U.q(doc, "body/listBibl/msDesc") || U.q(doc, "sourceDesc/msDesc");
    if (!msDesc) return out;

    // msIdentifier.
    var mi = U.q(msDesc, "msIdentifier");
    if (mi) {
      var idBlock = "";
      idBlock += row("Country", esc(U.text(U.q(mi, "country"))));
      idBlock += row("Settlement", esc(U.text(U.q(mi, "settlement"))));
      idBlock += row("Repository", esc(U.text(U.q(mi, "repository"))));
      idBlock += row("Collection", esc(U.text(U.q(mi, "collection"))));
      idBlock += row("Shelfmark", esc(U.text(U.q(mi, "idno"))));
      idBlock += row("Manuscript name", esc(U.text(U.q(mi, "msName"))));
      out += section("Identifier", idBlock);
    }

    // Contents (msItems with linked title/author refs).
    var mc = U.q(msDesc, "msContents");
    if (mc) {
      var contents = row("Summary", esc(U.text(U.q(mc, "summary"))));
      var items = U.qa(mc, "msItem").filter(function (it) { return it.parentNode === mc; }).map(function (item) {
        var bits = [];
        U.qa(item, "title").filter(function (t) { return t.parentNode === item; }).forEach(function (t) {
          bits.push("Title: " + refLink("work", t.getAttribute("ref") || "", U.text(t) || t.getAttribute("ref")));
        });
        U.qa(item, "author").filter(function (a) { return a.parentNode === item; }).forEach(function (a) {
          bits.push("Author: " + refLink("person", a.getAttribute("ref") || "", U.text(a) || a.getAttribute("ref")));
        });
        var note = U.text(U.q(item, "note"));
        if (note) bits.push(esc(note));
        return bits.length ? "<li>" + bits.join(" · ") + "</li>" : "";
      }).join("");
      if (items) contents += '<ul class="mb-0">' + items + "</ul>";
      out += section("Contents", contents);
    }

    // physDesc summaries.
    var phys = U.q(msDesc, "physDesc");
    if (phys) {
      var summaries = "";
      [["Object", "ab/objectType"], ["Hand", "handDesc/summary"], ["Decoration", "decoDesc/summary"], ["Layout", "objectDesc/layoutDesc/summary/note"]].forEach(function (pair) {
        var el = U.q(phys, pair[1]);
        if (el) summaries += row(pair[0], esc(U.text(el)));
      });
      out += section("Physical description", summaries);
    }

    // History.
    var hist = U.q(msDesc, "history");
    if (hist) {
      var h = row("Summary", esc(U.text(U.q(hist, "summary"))));
      out += section("History", h);
    }

    // Bibliography.
    var add = U.q(msDesc, "additional");
    if (add) {
      out += section("Bibliography", renderBibl(U.qa(add, "listBibl/bibl")));
    }

    return out;
  }

  function renderBibl(biblEls) {
    if (!biblEls || !biblEls.length) return "";
    var items = biblEls.map(function (b) {
      var title = U.text(U.q(b, "title"));
      var cited = U.text(U.q(b, "citedRange"));
      var ptr = U.attr(U.q(b, "ptr"), "target");
      var text = [title, cited].filter(Boolean).join(", ");
      if (ptr) text = (text ? text + " — " : "") + extLink(ptr, ptr);
      else text = esc(text);
      return text ? "<li>" + text + "</li>" : "";
    }).join("");
    return items ? '<ul class="mb-0">' + items + "</ul>" : "";
  }

  var RENDERERS = {
    person: renderPerson,
    place: renderPlace,
    work: renderWork,
    manuscript: renderManuscript
  };

  // ---- per-entity page controller ----

  function initEntityPage(type) {
    var meta = TYPES[type];
    if (!meta) { console.warn("BA.collection: unknown collection type " + type); return; }

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
          '<button type="button" class="btn btn-sm btn-outline-secondary btn-view me-1" data-id="' + esc(r.id) +
          '" title="View record" aria-label="View record"><i class="bi bi-eye"></i></button>' +
          '<a class="btn btn-sm btn-outline-primary btn-edit" href="' + esc(editorHref(type, r.id)) +
          '" title="Open in editor" aria-label="Open in editor"><i class="bi bi-pencil"></i></a>' +
          "</td></tr>";
      }).join("");
      listing.innerHTML =
        '<div class="table-responsive"><table class="table table-hover align-middle">' +
        "<thead><tr><th>Headword</th><th>ID</th><th>Alternative names</th><th></th></tr></thead>" +
        "<tbody>" + rows + "</tbody></table></div>";
      // Whole-row click stays "View record", except clicks on the action buttons.
      Array.prototype.forEach.call(listing.querySelectorAll("tbody tr"), function (tr) {
        tr.addEventListener("click", function (e) {
          if (e.target.closest && e.target.closest("a, button")) return;
          openRecord(type, tr.getAttribute("data-id"));
        });
      });
      // Explicit "View record" button (the "Open in editor" link navigates via href).
      Array.prototype.forEach.call(listing.querySelectorAll(".btn-view"), function (b) {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          openRecord(type, b.getAttribute("data-id"));
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

    // Load all types so cross-record refs resolve synchronously, then render.
    Promise.all(ALL.map(function (t) { return A.load(t); })).then(function () {
      return A.load(type);
    }).then(function (recs) {
      records = recs || [];
      renderListing(records);
      var id = new URLSearchParams(location.search).get("id");
      if (id) openRecord(type, id);
    });
  }

  function openRecord(type, id) {
    var meta = TYPES[type];
    // Look up the record in the loaded index by id, then fetch its TEI file.
    A.load(type).then(function (recs) {
      var r = null;
      for (var i = 0; i < recs.length; i++) { if (String(recs[i].id) === String(id)) { r = recs[i]; break; } }
      if (!r) { setModalEditorButton(null); showModal(meta.one, '<div class="alert alert-warning">Record not found.</div>'); return; }
      fetch(r.file)
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then(function (text) {
          var doc = U.parse(text);
          var html = renderShared(doc) + (RENDERERS[type] ? RENDERERS[type](doc) : "");
          setModalEditorButton(editorHref(type, r.id));
          showModal(r.headword || meta.one, html);
        })
        .catch(function (err) {
          setModalEditorButton(null);
          showModal(meta.one, '<div class="alert alert-danger">Could not load record: ' + esc(err.message) + "</div>");
        });
    });
  }

  // Ensure #recordModal has a footer with an "Open in editor" link (the modal
  // markup ships with only a header + body). Pass an href to show+target it, or
  // null to hide it (not-found / load-error views).
  function setModalEditorButton(href) {
    var modalEl = document.getElementById("recordModal");
    if (!modalEl) return;
    var content = modalEl.querySelector(".modal-content");
    if (!content) return;
    var footer = content.querySelector(".modal-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "modal-footer";
      content.appendChild(footer);
    }
    var btn = footer.querySelector(".modal-open-in-editor");
    if (!btn) {
      btn = document.createElement("a");
      btn.className = "btn btn-primary modal-open-in-editor";
      btn.innerHTML = '<i class="bi bi-pencil"></i> Open in editor';
      footer.appendChild(btn);
    }
    if (href) { btn.href = href; btn.classList.remove("d-none"); }
    else { btn.removeAttribute("href"); btn.classList.add("d-none"); }
  }

  function showModal(title, bodyHtml) {
    var titleEl = document.getElementById("recordModalTitle");
    var bodyEl = document.getElementById("recordModalBody");
    var modalEl = document.getElementById("recordModal");
    if (!modalEl || !bodyEl) return;
    if (titleEl) titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
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
