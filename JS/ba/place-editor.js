// Place editor: create, import, edit, export one TEI place record
// conforming to templates/place-fulltemplate.xml.
// Renders its form from BA.uiText (labels, help texts, vocabularies).
// Exposes window.PlaceEditor for wiring and tests.

(function () {
  "use strict";

  var U, F, H, LBL, V;

  function vocab(key) { return (V[key] || []); }
  function lbl(key) { return LBL[key] || { label: key, required: false }; }

  // ---------- HTML fragments ----------

  function labelHtml(key, overrideText) {
    var l = lbl(key);
    var star = l.required
      ? '<span class="required-star" data-bs-toggle="tooltip" title="Required field">*</span>'
      : "";
    var help = l.help
      ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' +
        U.esc(l.help) + '"></i>'
      : "";
    return '<label class="form-label">' + U.esc(overrideText || l.label) + star + help + "</label>";
  }

  function optionsHtml(list, selected, emptyLabel) {
    var out = '<option value="">' + U.esc(emptyLabel || "Please select") + "</option>";
    list.forEach(function (o) {
      out += '<option value="' + U.esc(o.v) + '"' + (o.v === selected ? " selected" : "") + ">" +
        U.esc(o.l) + "</option>";
    });
    return out;
  }

  // citedRange unit: display labels from the vocab; template value "p" for pages.
  function citedUnitList() {
    return vocab("citedRangeUnit").map(function (o) {
      return { v: o.v === "page" ? "p" : o.v, l: o.l };
    });
  }

  function sourceSelectHtml(cls) {
    return F.sourceSelectHtml(cls); // multi-select, title labels
  }

  // ---------- form rendering ----------

  function sectionHtml(title, help, bodyHtml) {
    return '<div class="border rounded p-3 mb-4">' +
      '<h5>' + U.esc(title) +
      (help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(help) + '"></i>' : "") +
      "</h5>" + bodyHtml + "</div>";
  }

  function renderForm() {
    var sections = {};
    window.BA.uiText.sections.place.forEach(function (s) { sections[s.name] = s; });

    var html =
      // Record metadata (shared block: ID, title, editor, status, change note)
      sectionHtml("Record", "Record identity, editor and publication status.",
        H.recordBlockHtml("place")) +

      // Sections below the Record block live in a Bootstrap accordion (first open).
      '<div class="accordion" id="placeAccordion">' +

      // Place: names + description + location
      F.accordionSectionHtml("placeAccordion", 0, sections.listPlace ? sections.listPlace.label : "Place",
        sections.listPlace ? sections.listPlace.help : "",
        '<h6 class="mt-2">' + U.esc(lbl("placeName").label) + 's</h6>' +
        '<div class="names-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary mb-3" id="addNameBtn">' +
        '<i class="bi bi-plus"></i> Add name</button>' +

        // desc/quote — long-text field full-width, its attributes (language,
        // source) in a compact row directly beneath (same TEI element: quote).
        "<h6>" + U.esc(lbl("desc").label) + "</h6>" +
        '<div class="row mb-2">' +
        '<div class="col-12">' + labelHtml("desc") +
        '<textarea class="form-control" name="descQuote" rows="2"></textarea></div>' +
        "</div>" +
        '<div class="row mb-3">' +
        '<div class="col-md-6"><label class="form-label">Language</label>' +
        '<select class="form-select" name="descLang">' + optionsHtml(vocab("langScript6")) + "</select></div>" +
        '<div class="col-md-6"><label class="form-label">Source</label>' + sourceSelectHtml("desc-source") + "</div>" +
        "</div>" +

        "<h6>" + U.esc(lbl("location").label) +
        (lbl("location").help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(lbl("location").help) + '"></i>' : "") + "</h6>" +
        '<div class="row mb-2">' +
        '<div class="col-md-6">' + labelHtml("geo") +
        '<input type="text" class="form-control" name="locGeo" placeholder="latitude, longitude" ' +
        'data-error="Use format: latitude, longitude (e.g. 30.0, 31.2)"></div>' +
        '<div class="col-md-6"><label class="form-label">Source (coordinates)</label>' + sourceSelectHtml("geo-source") + "</div>" +
        "</div>" +
        '<div class="row mb-2">' +
        '<div class="col-md-6">' + labelHtml("settlement") +
        '<input type="text" class="form-control lod-autocomplete" data-lod="local-place" name="locSettlement"></div>' +
        '<div class="col-md-6"><label class="form-label">Source (city)</label>' + sourceSelectHtml("settlement-source") + "</div>" +
        "</div>" +
        '<div class="row">' +
        '<div class="col-md-6">' + labelHtml("region") +
        '<input type="text" class="form-control lod-autocomplete" data-lod="local-place" name="locRegion"></div>' +
        '<div class="col-md-6"><label class="form-label">Source (region)</label>' + sourceSelectHtml("region-source") + "</div>" +
        "</div>", true) +

      // External identifiers
      F.accordionSectionHtml("placeAccordion", 1, sections.idnoData ? sections.idnoData.label : "Linked Open Data",
        sections.idnoData ? sections.idnoData.help : "",
        '<div class="idno-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary" id="addIdnoBtn">' +
        '<i class="bi bi-plus"></i> Add identifier</button>', false) +

      // Bibliography
      F.accordionSectionHtml("placeAccordion", 2, sections.additional ? sections.additional.label : "Bibliography",
        sections.additional ? sections.additional.help : "",
        '<div class="bibl-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary" id="addBiblBtn">' +
        '<i class="bi bi-plus"></i> Add reference</button>', false) +
      "</div>"; // close #placeAccordion

    document.getElementById("placeForm").innerHTML = html;
  }

  // ---------- repeatable blocks ----------

  function namesContainer() { return document.querySelector("#placeForm .names-container"); }
  function idnoContainer() { return document.querySelector("#placeForm .idno-container"); }
  function biblContainer() { return document.querySelector("#placeForm .bibl-container"); }

  function addNameBlock(data) {
    data = data || {};
    var block = F.addBlock(namesContainer(),
      '<div class="row">' +
      '<div class="col-md-5">' + labelHtml("placeName") +
      '<input type="text" class="form-control pn-name" value="' + U.esc(data.name || "") + '"></div>' +
      '<div class="col-md-3"><label class="form-label">Language</label>' +
      '<select class="form-select pn-lang">' + optionsHtml(vocab("langScript6"), data.lang) + "</select></div>" +
      '<div class="col-md-2"><label class="form-label">Headword?</label>' +
      '<div class="form-check"><input type="checkbox" class="form-check-input pn-headword"' +
      (data.headword ? " checked" : "") + "></div></div>" +
      '<div class="col-md-2"><label class="form-label">Source</label>' + sourceSelectHtml("pn-source") + "</div>" +
      "</div>");
    refreshSourceSelects();
    if (data.source) F.setSourceSelect(block.querySelector(".pn-source"), data.source);
    F.initTooltips(block);
    return block;
  }

  // Uppercase source label (e.g. "GEONAMES") shown before the input/URI, so the
  // row reads label-then-link. Display only — no serialization change.
  function setIdnoSourceBadge(block, uri) {
    var slot = block.querySelector(".idno-source-slot");
    if (!slot) return;
    slot.innerHTML = uri
      ? '<span class="badge bg-secondary idno-source-label">' + U.esc(F.sourceLabel(uri).toUpperCase()) + "</span>"
      : "";
  }

  function addIdnoBlock(uri) {
    var block = F.addBlock(idnoContainer(),
      '<div class="row align-items-center">' +
      '<div class="col-md-3 idno-source-slot"></div>' +
      '<div class="col-md-9">' + labelHtml("idno") +
      '<input type="text" class="form-control lod-autocomplete idno-uri" ' +
      'data-lod="geonames gnd-place wikidata-place" placeholder="Search GeoNames / GND / Wikidata — or paste a URI">' +
      "</div>" +
      "</div>");
    if (uri) {
      var input = block.querySelector(".idno-uri");
      input.value = uri;
      input.dataset.lodUri = uri;
      F.attachBadge(input, uri);
      setIdnoSourceBadge(block, uri);
    }
    F.initTooltips(block);
    return block;
  }

  var biblCounter = 0;
  var importedChanges = []; // append-only <change> history carried across import/export

  // Zotero lookup input — rendered only when the provider is enabled (libraryId set).
  function zoteroLookupHtml() {
    var p = window.BA.lod.providers.zotero;
    if (!(p && p.enabled && p.enabled())) return "";
    return '<div class="row mb-2"><div class="col-md-8">' + labelHtml("bibl") +
      '<input type="text" class="form-control lod-autocomplete zot-lookup" data-lod="zotero" ' +
      'placeholder="Search the project\'s Zotero library"></div></div>';
  }

  // Fill a bibl block from a selected Zotero result, then clear the lookup input.
  function fillBiblFromZotero(e) {
    var field = e.target;
    if (!field.classList || !field.classList.contains("zot-lookup")) return;
    var block = field.closest ? field.closest(".ba-block") : null;
    if (!block) return;
    var detail = e.detail || {};
    var titleEl = block.querySelector(".bibl-title");
    var ptrEl = block.querySelector(".bibl-ptr");
    // Prefer the formatted CMOS-17 note citation; fall back to the short title.
    var biblTitle = detail.extra && (detail.extra.citation || detail.extra.title);
    if (titleEl && biblTitle) {
      titleEl.value = biblTitle;
      // Fire input so the dirty guard and source-select refresh run —
      // the reference is then immediately selectable as a source with its title.
      titleEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (ptrEl && detail.uri) ptrEl.value = detail.uri;
    field.value = "";
    delete field.dataset.lodUri;
    var badge = field.parentNode && field.parentNode.querySelector(".lod-link");
    if (badge) badge.remove();
  }

  function addBiblBlock(data) {
    data = data || {};
    var id = data.id || ("bib" + (++biblCounter));
    // keep counter ahead of imported ids
    var m = /^bib(\d+)$/.exec(id);
    if (m && parseInt(m[1], 10) > biblCounter) biblCounter = parseInt(m[1], 10);

    var block = F.addBlock(biblContainer(),
      zoteroLookupHtml() +
      '<div class="row">' +
      '<div class="col-md-4"><label class="form-label">' + U.esc(lbl("title").label) +
      (lbl("title").required ? '<span class="required-star" data-bs-toggle="tooltip" title="Required field">*</span>' : "") +
      "</label><input type=\"text\" class=\"form-control bibl-title\" value=\"" + U.esc(data.title || "") + '"></div>' +
      '<div class="col-md-3">' + labelHtml("citedRange") +
      '<input type="text" class="form-control bibl-cited" value="' + U.esc(data.cited || "") + '"></div>' +
      '<div class="col-md-2"><label class="form-label">Unit</label>' +
      '<select class="form-select bibl-unit">' + optionsHtml(citedUnitList(), data.unit || "p", "—") + "</select></div>" +
      '<div class="col-md-2">' + labelHtml("ptr") +
      '<input type="url" class="form-control bibl-ptr" value="' + U.esc(data.ptr || "") + '"></div>' +
      '<div class="col-md-1"><label class="form-label">ID</label>' +
      '<input type="text" class="form-control bibl-id" value="' + U.esc(id) + '" readonly></div>' +
      "</div>");
    refreshSourceSelects();
    F.initTooltips(block);
    return block;
  }

  // Repopulate every source select from the current bibliography blocks.
  function refreshSourceSelects() {
    F.refreshSourceSelects(document.getElementById("placeForm"), biblContainer());
  }

  // ---------- data collection ----------

  function fieldVal(name) {
    var el = document.querySelector('#placeForm [name="' + name + '"]');
    return (el && el.value.trim()) || "";
  }

  function fieldUri(name) {
    var el = document.querySelector('#placeForm [name="' + name + '"]');
    return (el && el.dataset.lodUri) || "";
  }

  function getPlaceData() {
    var names = F.blocks(namesContainer()).map(function (b) {
      return {
        name: F.val(b, "pn-name"),
        lang: F.val(b, "pn-lang"),
        headword: !!b.querySelector(".pn-headword:checked"),
        source: F.readSourceSelect(b.querySelector(".pn-source"))
      };
    }).filter(function (n) { return n.name; });
    // headword rows first (stable otherwise)
    names.sort(function (a, b) { return (b.headword ? 1 : 0) - (a.headword ? 1 : 0); });

    return {
      id: fieldVal("recordId"),
      recordTitle: fieldVal("recordTitle"),
      creatorId: fieldVal("creatorId"),
      status: fieldVal("status") || "unpublished",
      names: names,
      desc: {
        text: fieldVal("descQuote"),
        lang: fieldVal("descLang"),
        source: F.readSourceSelect(document.querySelector("#placeForm .desc-source"))
      },
      location: {
        geo: fieldVal("locGeo"),
        geoSource: F.readSourceSelect(document.querySelector("#placeForm .geo-source")),
        settlement: { value: fieldVal("locSettlement"), uri: fieldUri("locSettlement") },
        settlementSource: F.readSourceSelect(document.querySelector("#placeForm .settlement-source")),
        region: { value: fieldVal("locRegion"), uri: fieldUri("locRegion") },
        regionSource: F.readSourceSelect(document.querySelector("#placeForm .region-source"))
      },
      idnos: F.blocks(idnoContainer()).map(function (b) {
        var input = b.querySelector(".idno-uri");
        return (input.dataset.lodUri || input.value.trim());
      }).filter(Boolean),
      bibl: F.blocks(biblContainer()).map(function (b) {
        return {
          id: F.val(b, "bibl-id"), title: F.val(b, "bibl-title"),
          cited: F.val(b, "bibl-cited"), unit: F.val(b, "bibl-unit"), ptr: F.val(b, "bibl-ptr")
        };
      }).filter(function (x) { return x.title || x.cited || x.ptr; })
    };
  }

  // ---------- serialization ----------

  function geoOut(geoInput) {
    // input "lat, lng" -> TEI "lat lng"
    return geoInput.split(",").map(function (s) { return s.trim(); }).filter(Boolean).join(" ");
  }

  function buildPlaceBody(d) {
    var parts = [];

    d.names.forEach(function (n) {
      parts.push(U.el("placeName", {
        "xml:lang": n.lang,
        type: n.headword ? "ba-headword" : "",
        source: n.source
      }, U.esc(n.name)));
    });

    if (d.desc.text) {
      parts.push(U.el("desc", null,
        U.el("quote", { source: d.desc.source, "xml:lang": d.desc.lang }, U.esc(d.desc.text))));
    }

    var loc = [];
    if (d.location.geo) loc.push(U.el("geo", { source: d.location.geoSource }, U.esc(geoOut(d.location.geo))));
    if (d.location.settlement.value) {
      loc.push(U.el("settlement", { ref: d.location.settlement.uri, source: d.location.settlementSource },
        U.esc(d.location.settlement.value)));
    }
    if (d.location.region.value) {
      loc.push(U.el("region", { ref: d.location.region.uri, source: d.location.regionSource },
        U.esc(d.location.region.value)));
    }
    if (loc.length) parts.push(U.el("location", null, loc));

    d.idnos.forEach(function (uri) {
      parts.push(U.el("idno", { type: "URI" }, U.esc(uri)));
    });

    d.bibl.forEach(function (b) {
      var kids = [];
      if (b.title) kids.push(U.el("title", null, U.esc(b.title)));
      if (b.cited) kids.push(U.el("citedRange", { unit: b.unit }, U.esc(b.cited)));
      if (b.ptr) kids.push(U.el("ptr", { target: b.ptr }));
      parts.push(U.el("bibl", { "xml:id": b.id }, kids));
    });

    return "<text><body><listPlace><place>\n" + parts.join("\n") + "\n</place></listPlace></body></text>";
  }

  function buildPlaceXML() {
    var d = getPlaceData();
    var rb = H.readRecordBlock(document.getElementById("placeForm"));
    return U.indent(
      H.prolog("place") + H.rootOpen("place") +
      H.build({
        entityType: "place", articleTitle: rb.recordTitle, recordId: rb.recordId,
        creatorId: rb.creatorId, status: rb.status,
        changeNote: rb.changeNote, changes: importedChanges
      }) +
      buildPlaceBody(d) + "</TEI>");
  }

  // ---------- import ----------

  function setLodField(name, value, uri, type) {
    var input = document.querySelector('#placeForm [name="' + name + '"]');
    if (!input) return;
    var label = value;
    if (uri) {
      var rec = window.BA.authority.resolve(type, uri);
      if (rec && rec.headword) label = rec.headword;
      input.dataset.lodUri = uri;
    }
    input.value = label || value || uri || "";
    if (uri) F.attachBadge(input, uri);
  }

  function importPlaceXML(text, filename) {
    var doc = U.parse(text); // throws on invalid XML
    var hdr = H.parse(doc);

    importedChanges = hdr.changes || [];

    renderForm(); // reset
    wireStaticFields();

    var recordNotice = applyRecordBlock(hdr, filename);

    // bibliography first, so source selects can be populated
    U.qa(doc, "place/bibl").forEach(function (b) {
      addBiblBlock({
        id: b.getAttribute("xml:id") || "",
        title: U.text(U.q(b, "bibl/title") || b.getElementsByTagNameNS("*", "title")[0]),
        cited: U.text(b.getElementsByTagNameNS("*", "citedRange")[0]),
        unit: U.attr(b.getElementsByTagNameNS("*", "citedRange")[0], "unit"),
        ptr: U.attr(b.getElementsByTagNameNS("*", "ptr")[0], "target")
      });
    });

    U.qa(doc, "place/placeName").forEach(function (pn) {
      var type = pn.getAttribute("type") || "";
      addNameBlock({
        name: U.text(pn),
        lang: pn.getAttribute("xml:lang") || "",
        headword: type === "ba-headword" || type === "majlis-headword",
        source: pn.getAttribute("source") || ""
      });
    });

    var quote = U.q(doc, "place/desc/quote");
    if (quote) {
      document.querySelector('#placeForm [name="descQuote"]').value = U.text(quote);
      document.querySelector('#placeForm [name="descLang"]').value = quote.getAttribute("xml:lang") || "";
      refreshSourceSelects();
      F.setSourceSelect(document.querySelector("#placeForm .desc-source"), quote.getAttribute("source") || "");
    }

    var geo = U.q(doc, "place/location/geo");
    if (geo) {
      document.querySelector('#placeForm [name="locGeo"]').value =
        U.text(geo).split(/\s+/).filter(Boolean).join(", ");
      refreshSourceSelects();
      F.setSourceSelect(document.querySelector("#placeForm .geo-source"), geo.getAttribute("source") || "");
    }
    var st = U.q(doc, "place/location/settlement");
    if (st) {
      setLodField("locSettlement", U.text(st), st.getAttribute("ref") || "", "place");
      F.setSourceSelect(document.querySelector("#placeForm .settlement-source"), st.getAttribute("source") || "");
    }
    var rg = U.q(doc, "place/location/region");
    if (rg) {
      setLodField("locRegion", U.text(rg), rg.getAttribute("ref") || "", "place");
      F.setSourceSelect(document.querySelector("#placeForm .region-source"), rg.getAttribute("source") || "");
    }

    U.qa(doc, "place/idno[@type='URI']").forEach(function (idno) {
      if (U.text(idno)) addIdnoBlock(U.text(idno));
    });

    F.initTooltips(document.getElementById("placeForm"));
    F.markClean(); // freshly imported record is not yet dirty
    showAlert((recordNotice ? recordNotice + " " : "") + "Imported. Review all sections before downloading.",
      recordNotice ? "warning" : "success");
    return hdr;
  }

  // ---------- page wiring ----------

  var previewCM = null;

  function showAlert(message, kind) {
    var zone = document.getElementById("alertZone");
    if (!zone) { console.warn(message); return; }
    zone.innerHTML = '<div class="alert alert-' + (kind || "warning") + ' alert-dismissible" role="alert">' +
      U.esc(message) +
      '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>';
  }

  // Reload all four authority indexes (any editor can link to any type),
  // bypassing the 1 h localStorage cache, then report per-type record counts.
  function reloadIndexes() {
    var types = ["manuscript", "person", "place", "work"];
    Promise.all(types.map(function (t) { return window.BA.authority.refresh(t); }))
      .then(function (lists) {
        var counts = types.map(function (t, i) { return t + ": " + lists[i].length; }).join(", ");
        showAlert("Records reloaded — " + counts + ".", "success");
      });
  }

  function updateUriDisplay() {
    var id = fieldVal("recordId");
    var out = document.getElementById("recordUri");
    if (out) {
      out.textContent = id
        ? window.BA.config.baseUri + "/" + window.BA.config.entityPaths.place + "/" + id
        : "";
    }
  }

  function wireStaticFields() {
    var idInput = document.querySelector('#placeForm [name="recordId"]');
    if (idInput) idInput.addEventListener("input", updateUriDisplay);
  }

  // Populate the shared Record block from a parsed header (identical logic in
  // all four editors). Record ID is recovered from the header idno, else the
  // uploaded filename; returns a warning string when neither yields an id.
  function applyRecordBlock(hdr, filename) {
    var form = document.getElementById("placeForm");
    function set(name, val) { var el = form.querySelector('[name="' + name + '"]'); if (el) el.value = val; }
    set("recordTitle", hdr.articleTitle || "");
    set("creatorId", hdr.creatorId || "");
    if (hdr.status) set("status", hdr.status);
    var fileId = (filename && (filename.match(/^(\d+)\.xml$/) || [])[1]) || "";
    var recId = hdr.recordId || fileId;
    set("recordId", recId);
    updateUriDisplay();
    return recId ? "" : "Record ID could not be recovered — set it manually before download.";
  }

  function showPreview() {
    var xml = buildPlaceXML();
    var ta = document.getElementById("xmlPreviewEditor");
    if (typeof CodeMirror !== "undefined" && ta) {
      if (!previewCM) {
        previewCM = CodeMirror.fromTextArea(ta, { mode: "xml", lineNumbers: true, readOnly: true });
      }
      previewCM.setValue(xml);
      setTimeout(function () { previewCM.refresh(); }, 200);
    } else if (ta) {
      ta.value = xml;
    }
    if (typeof bootstrap !== "undefined") {
      new bootstrap.Modal(document.getElementById("xmlModal")).show();
    }
    return xml;
  }

  function download() {
    var d = getPlaceData();
    var id = d.id || "place";
    window.BA.authority.checkCollision("place", id).then(function (exists) {
      if (exists && !window.confirm("A place with id " + id +
        " already exists in the index. Download anyway?")) return;
      var blob = new Blob([buildPlaceXML()], { type: "application/xml" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = id + ".xml";
      a.click();
      F.markClean(); // record saved locally
    });
  }

  function newRecord(skipConfirm) {
    if (!skipConfirm && !window.confirm("Clear the form and start a new place record?")) return;
    biblCounter = 0;
    importedChanges = [];
    renderForm();
    wireStaticFields();
    addNameBlock();
    window.BA.authority.nextId("place").then(function (id) {
      var input = document.querySelector('#placeForm [name="recordId"]');
      if (input && !input.value) { input.value = id; updateUriDisplay(); }
    });
    F.initTooltips(document.getElementById("placeForm"));
    F.markClean(); // fresh form
  }

  function init() {
    U = window.BA.util; F = window.BA.form; H = window.BA.header;
    LBL = window.BA.uiText.labels.place.place;
    V = window.BA.uiText.vocab;

    window.BA.authority.load("place"); // local-place autocomplete + resolve()

    newRecord(true);

    // Unsaved-changes guard: flag edits inside the form, warn on exit.
    F.trackDirty(document.getElementById("placeForm"));
    F.installUnloadGuard();

    // ?load={id} deep link: import data/places/{id}.xml on init.
    loadFromQuery();

    // Add-buttons live inside the re-renderable form -> pure delegation.
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      if (e.target.closest("#addNameBtn")) addNameBlock();
      if (e.target.closest("#addIdnoBtn")) addIdnoBlock();
      if (e.target.closest("#addBiblBtn")) addBiblBlock();
      if (e.target.closest("#reloadIndexBtn")) reloadIndexes();
    });

    // bibliography changes -> refresh source selects
    document.getElementById("placeForm").addEventListener("input", function (e) {
      if (e.target.closest && e.target.closest(".bibl-container")) refreshSourceSelects();
    });

    // Zotero bibliography lookup -> fill title + ptr, clear the lookup.
    document.addEventListener("ba-lod-selected", fillBiblFromZotero);

    // GeoNames autofill: coordinates from selected result if the field is empty
    document.addEventListener("ba-lod-selected", function (e) {
      var field = e.target;
      if (!field.classList || !field.classList.contains("idno-uri")) return;
      // Source label before the link (label-then-link).
      var block = field.closest ? field.closest(".ba-block") : null;
      if (block) setIdnoSourceBadge(block, field.dataset.lodUri || (e.detail && e.detail.uri) || "");
      var extra = e.detail && e.detail.extra;
      var geoField = document.querySelector('#placeForm [name="locGeo"]');
      if (extra && extra.lat && geoField && !geoField.value.trim()) {
        geoField.value = extra.lat + ", " + extra.lng;
      }
    });

    var up = document.getElementById("fileUpload");
    if (up) {
      up.addEventListener("change", function (e) {
        var file = e.target.files[0];
        if (!file) return;
        if (!file.name.endsWith(".xml")) { showAlert("Only XML files are allowed.", "warning"); return; }
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            importPlaceXML(ev.target.result, file.name);
          } catch (err) {
            showAlert("Import failed: " + err.message, "danger");
          }
        };
        reader.readAsText(file);
      });
    }

    var btn = document.getElementById("newRecordBtn");
    if (btn) btn.addEventListener("click", function () { newRecord(false); });
    btn = document.getElementById("previewBtn");
    if (btn) btn.addEventListener("click", showPreview);
    btn = document.getElementById("downloadBtn");
    if (btn) btn.addEventListener("click", download);

    // Open-from-repository picker.
    btn = document.getElementById("openRepoBtn");
    if (btn) btn.addEventListener("click", function () {
      if (F.isDirty() && !window.confirm("Unsaved changes will be lost. Continue?")) return;
      F.openRepoPicker("place", function (text, filename) {
        importPlaceXML(text, filename);
        F.markClean();
        showAlert("Loaded " + filename + " from the repository.", "success");
      });
    });

    // Submit to repository: validation gate lives in BA.github.openSubmit.
    btn = document.getElementById("submitRepoBtn");
    if (btn) btn.addEventListener("click", function () {
      var d = getPlaceData();
      var rb = H.readRecordBlock(document.getElementById("placeForm"));
      window.BA.github.openSubmit({
        type: "place", id: d.id || "place", xml: buildPlaceXML(),
        data: d, changeNote: rb.changeNote
      });
    });
  }

  // ?load={id}: resolve the id in the place index and import its file.
  function loadFromQuery() {
    var id = new URLSearchParams(location.search).get("load");
    if (!id || !/^\d+$/.test(id)) return;
    window.BA.authority.load("place").then(function (recs) {
      var rec = null;
      for (var i = 0; i < recs.length; i++) { if (String(recs[i].id) === id) { rec = recs[i]; break; } }
      if (!rec) {
        showAlert("Record " + id + " not found in the place index — rebuild the index if the file was just added", "warning");
        return;
      }
      fetch(rec.file)
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then(function (text) { importPlaceXML(text, (rec.file || "").split("/").pop()); F.markClean(); })
        .catch(function (err) { showAlert("Could not load record " + id + ": " + err.message, "danger"); });
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  // Public API (used by tests and by later tasks' cross-editor links).
  window.PlaceEditor = {
    init: init,
    getPlaceData: function () { return getPlaceData(); },
    buildPlaceXML: function () { return buildPlaceXML(); },
    importPlaceXML: function (t, f) { return importPlaceXML(t, f); },
    addNameBlock: function (d) { return addNameBlock(d); },
    addIdnoBlock: function (u) { return addIdnoBlock(u); },
    addBiblBlock: function (d) { return addBiblBlock(d); },
    refreshSourceSelects: refreshSourceSelects,
    newRecord: newRecord
  };
})();
