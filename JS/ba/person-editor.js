// Person editor: create, import, edit, export one TEI person record
// conforming to templates/persons-fulltemplate.xml.
// Renders its form from BA.uiText (labels, help texts, vocabularies).
// Hosts GND (lobid), VIAF, and Wikidata person lookups.
// Exposes window.PersonEditor for wiring and tests.

(function () {
  "use strict";

  var U, F, H, LBL, V;

  // Round-trip state: raw <standOff> and any unmapped <person> children.
  var importedStandOff = "";
  var importExtras = [];
  var importedChanges = []; // append-only <change> history carried across import/export

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

  // personName type select: majlis-headword -> ba-headword (Discrepancy 1),
  // and "alternate" appended (Discrepancy 5).
  function nameTypeList() {
    var out = [];
    vocab("personNameType").forEach(function (o) {
      if (o.v === "majlis-headword") out.push({ v: "ba-headword", l: "BA headword" });
      else out.push({ v: o.v, l: o.l });
    });
    out.push({ v: "alternate", l: "Alternate name form" });
    return out;
  }

  // sex select: value = first letter (U/F/M); element content = full label (Discrepancy 6).
  function sexList() {
    return vocab("sexValue").map(function (o) { return { v: o.v.charAt(0), l: o.l }; });
  }

  function sourceSelectHtml(cls) {
    return F.sourceSelectHtml(cls); // multi-select, title labels
  }

  function sourceSelectNamed(name) {
    return F.sourceSelectHtml("", name);
  }

  function certSelectHtml(cls) {
    return '<select class="form-select ' + cls + '">' + optionsHtml(vocab("certainty"), "", "— certainty —") + "</select>";
  }

  function certSelectNamed(name) {
    return '<select class="form-select" name="' + name + '">' + optionsHtml(vocab("certainty"), "", "— certainty —") + "</select>";
  }

  // ---------- form rendering ----------

  function sectionHtml(title, help, bodyHtml) {
    return '<div class="border rounded p-3 mb-4">' +
      '<h5>' + U.esc(title) +
      (help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(help) + '"></i>' : "") +
      "</h5>" + bodyHtml + "</div>";
  }

  function dateFieldsHtml() {
    return F.dateGroupHtml("ev-date", {
      withText: false,
      cert: certSelectHtml("ev-date-cert"),
      source: sourceSelectHtml("ev-date-source")
    });
  }

  function placeFieldsHtml() {
    return '<div class="row g-2">' +
      '<div class="col-md-5">' + labelHtml("placeName") +
      '<input type="text" class="form-control lod-autocomplete ev-place" data-lod="local-place"></div>' +
      '<div class="col-md-3"><label class="form-label">Degree of certainty</label>' + certSelectHtml("ev-place-cert") + "</div>" +
      '<div class="col-md-4"><label class="form-label">Source</label>' + sourceSelectHtml("ev-place-source") + "</div>" +
      "</div>";
  }

  function lifeEventSection(kind, title, help, btnId) {
    return '<h6 class="mt-3">' + U.esc(title) +
      (help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(help) + '"></i>' : "") + "</h6>" +
      '<div class="' + kind + '-container"></div>' +
      '<button type="button" class="btn btn-sm btn-primary mb-3" id="' + btnId + '">' +
      '<i class="bi bi-plus"></i> Add ' + U.esc(title.toLowerCase()) + "</button>";
  }

  function renderForm() {
    var sections = {};
    window.BA.uiText.sections.person.forEach(function (s) { sections[s.name] = s; });

    function sec(name, fallback) { return sections[name] ? sections[name].label : fallback; }
    function secHelp(name) { return sections[name] ? sections[name].help : ""; }

    var html =
      // Record metadata (shared block: ID, title, editor, status, change note)
      sectionHtml("Record", "Record identity, editor and publication status.",
        H.recordBlockHtml("person")) +

      // Sections below the Record block live in a Bootstrap accordion (first open).
      '<div class="accordion" id="personAccordion">' +

      // Names (repeatable)
      F.accordionSectionHtml("personAccordion", 0, sec("persNames", "Personal name"), secHelp("persNames"),
        '<div class="names-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary mb-2" id="addNameBtn">' +
        '<i class="bi bi-plus"></i> Add name</button>', true) +

      // Biographical data
      F.accordionSectionHtml("personAccordion", 1, sec("biographicalData", "Biographical data"), secHelp("biographicalData"),
        // Note — long-text field full-width; its attributes (language, type,
        // author) in a compact row directly beneath (same TEI element: note).
        "<h6>" + U.esc(lbl("note").label) +
        (lbl("note").help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(lbl("note").help) + '"></i>' : "") + "</h6>" +
        '<div class="row mb-2">' +
        '<div class="col-12"><label class="form-label">' + U.esc(lbl("note").label) + '</label>' +
        '<textarea class="form-control" name="noteText" rows="2"></textarea></div>' +
        "</div>" +
        '<div class="row mb-3">' +
        '<div class="col-md-4"><label class="form-label">Language</label>' +
        '<select class="form-select" name="noteLang">' + optionsHtml(vocab("langNotePerson")) + "</select></div>" +
        '<div class="col-md-4"><label class="form-label">Type</label>' +
        '<input type="text" class="form-control" name="noteType"></div>' +
        '<div class="col-md-4"><label class="form-label">Author</label>' +
        '<select class="form-select" name="noteResp">' + optionsHtml(vocab("noteResp")) + "</select></div>" +
        "</div>" +

        // State / Role
        "<h6>" + U.esc(lbl("label").label) +
        (lbl("label").help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(lbl("label").help) + '"></i>' : "") + "</h6>" +
        '<div class="row mb-3">' +
        '<div class="col-md-5"><label class="form-label">' + U.esc(lbl("label").label) + '</label>' +
        '<select class="form-select" name="stateLabel">' + optionsHtml(vocab("personRoleLabel")) + "</select></div>" +
        '<div class="col-md-3"><label class="form-label">Degree of certainty</label>' + certSelectNamed("stateCert") + "</div>" +
        '<div class="col-md-4"><label class="form-label">Source</label>' + sourceSelectNamed("stateSource") + "</div>" +
        "</div>" +

        // Life events
        lifeEventSection("birth", lbl("birth").label, lbl("birth").help, "addBirthBtn") +
        lifeEventSection("death", lbl("death").label, lbl("death").help, "addDeathBtn") +
        lifeEventSection("floruit", lbl("floruit").label, lbl("floruit").help, "addFloruitBtn") +

        // Sex
        "<h6 class=\"mt-3\">" + U.esc(lbl("sex").label) +
        (lbl("sex").help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(lbl("sex").help) + '"></i>' : "") + "</h6>" +
        '<div class="row mb-3">' +
        '<div class="col-md-5"><label class="form-label">' + U.esc(lbl("sex").label) + '</label>' +
        '<select class="form-select" name="sexValue">' + optionsHtml(sexList()) + "</select></div>" +
        '<div class="col-md-3"><label class="form-label">Degree of certainty</label>' + certSelectNamed("sexCert") + "</div>" +
        '<div class="col-md-4"><label class="form-label">Source</label>' + sourceSelectNamed("sexSource") + "</div>" +
        "</div>" +

        // Faith
        "<h6>" + U.esc(lbl("faith").label) +
        (lbl("faith").help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(lbl("faith").help) + '"></i>' : "") + "</h6>" +
        '<div class="row mb-3">' +
        '<div class="col-md-5"><label class="form-label">' + U.esc(lbl("faith").label) + '</label>' +
        F.selectWithOtherHtml("faith", "faithValue", "") + "</div>" +
        '<div class="col-md-3"><label class="form-label">Degree of certainty</label>' + certSelectNamed("faithCert") + "</div>" +
        '<div class="col-md-4"><label class="form-label">Source</label>' + sourceSelectNamed("faithSource") + "</div>" +
        "</div>" +

        // Occupation (repeatable)
        "<h6>" + U.esc(lbl("occupation").label) +
        (lbl("occupation").help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(lbl("occupation").help) + '"></i>' : "") + "</h6>" +
        '<div class="occ-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary mb-3" id="addOccBtn">' +
        '<i class="bi bi-plus"></i> Add professional activity</button>' +

        // Residence (repeatable)
        "<h6>" + U.esc(lbl("residence").label) +
        (lbl("residence").help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(lbl("residence").help) + '"></i>' : "") + "</h6>" +
        '<div class="res-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary" id="addResBtn">' +
        '<i class="bi bi-plus"></i> Add place of residence</button>', false) +

      // Bibliography (repeatable)
      F.accordionSectionHtml("personAccordion", 2, sec("biblData", "Bibliography"), secHelp("biblData"),
        '<div class="bibl-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary" id="addBiblBtn">' +
        '<i class="bi bi-plus"></i> Add reference</button>', false) +

      // External identifiers
      F.accordionSectionHtml("personAccordion", 3, sec("idnoData", "Linked Open Data"), secHelp("idnoData"),
        '<div class="row mb-2">' +
        '<div class="col-md-9">' + labelHtml("idno") +
        '<input type="text" class="form-control lod-autocomplete idno-lookup" ' +
        'data-lod="gnd-person viaf-person wikidata-person" ' +
        'placeholder="Search GND / VIAF / Wikidata — or paste a URI"></div>' +
        '<div class="col-md-3 d-flex align-items-end">' +
        '<button type="button" class="btn btn-primary w-100" id="addIdnoBtn">' +
        '<i class="bi bi-plus"></i> Add</button></div>' +
        "</div>" +
        '<div class="idno-container"></div>', false) +
      "</div>"; // close #personAccordion

    document.getElementById("personForm").innerHTML = html;
  }

  // ---------- containers ----------

  function namesContainer() { return document.querySelector("#personForm .names-container"); }
  function lifeContainer(kind) { return document.querySelector("#personForm ." + kind + "-container"); }
  function occContainer() { return document.querySelector("#personForm .occ-container"); }
  function resContainer() { return document.querySelector("#personForm .res-container"); }
  function biblContainer() { return document.querySelector("#personForm .bibl-container"); }
  function idnoContainer() { return document.querySelector("#personForm .idno-container"); }

  // ---------- repeatable blocks ----------

  function addNameBlock(data) {
    data = data || {};
    var block = F.addBlock(namesContainer(),
      '<div class="row">' +
      '<div class="col-md-5">' + labelHtml("persName") +
      '<input type="text" class="form-control pn-name" value="' + U.esc(data.name || "") + '"></div>' +
      '<div class="col-md-3"><label class="form-label">Type</label>' +
      '<select class="form-select pn-type">' + optionsHtml(nameTypeList(), data.type || "ba-headword", "— type —") + "</select></div>" +
      '<div class="col-md-2"><label class="form-label">Language</label>' +
      '<select class="form-select pn-lang">' + optionsHtml(vocab("langScript6"), data.lang) + "</select></div>" +
      '<div class="col-md-2"><label class="form-label">Source</label>' + sourceSelectHtml("pn-source") + "</div>" +
      "</div>");
    refreshSourceSelects();
    if (data.source) F.setSourceSelect(block.querySelector(".pn-source"), data.source);
    F.initTooltips(block);
    return block;
  }

  function addLifeEventBlock(kind, data) {
    data = data || {};
    var block = F.addBlock(lifeContainer(kind),
      dateFieldsHtml() + placeFieldsHtml());
    if (data.placeCert) block.querySelector(".ev-place-cert").value = data.placeCert;
    if (data.place) {
      var input = block.querySelector(".ev-place");
      var label = data.place.value || "";
      if (data.place.uri) {
        var rec = window.BA.authority.resolve("place", data.place.uri);
        if (rec && rec.headword) label = rec.headword;
        input.dataset.lodUri = data.place.uri;
      }
      input.value = label || (data.place.uri || "");
      if (data.place.uri) F.attachBadge(input, data.place.uri);
    }
    refreshSourceSelects();
    F.setDateGroup(block, "ev-date", {
      when: data.when, from: data.from, to: data.to,
      cert: data.dateCert, source: data.dateSource
    });
    if (data.placeSource) F.setSourceSelect(block.querySelector(".ev-place-source"), data.placeSource);
    F.initTooltips(block);
    return block;
  }

  function addOccBlock(data) {
    data = data || {};
    var block = F.addBlock(occContainer(),
      '<div class="row">' +
      '<div class="col-md-5"><label class="form-label">' + U.esc(lbl("occupation").label) + '</label>' +
      '<input type="text" class="form-control occ-type" value="' + U.esc(data.type || "") + '"></div>' +
      '<div class="col-md-3"><label class="form-label">Degree of certainty</label>' + certSelectHtml("occ-cert") + "</div>" +
      '<div class="col-md-4"><label class="form-label">Source</label>' + sourceSelectHtml("occ-source") + "</div>" +
      "</div>");
    if (data.cert) block.querySelector(".occ-cert").value = data.cert;
    refreshSourceSelects();
    if (data.source) F.setSourceSelect(block.querySelector(".occ-source"), data.source);
    F.initTooltips(block);
    return block;
  }

  function addResBlock(data) {
    data = data || {};
    var block = F.addBlock(resContainer(),
      '<div class="row">' +
      '<div class="col-md-5">' + labelHtml("placeName") +
      '<input type="text" class="form-control lod-autocomplete res-place" data-lod="local-place"></div>' +
      '<div class="col-md-3"><label class="form-label">Degree of certainty</label>' + certSelectHtml("res-cert") + "</div>" +
      '<div class="col-md-4"><label class="form-label">Source</label>' + sourceSelectHtml("res-source") + "</div>" +
      "</div>");
    if (data.place) {
      var input = block.querySelector(".res-place");
      var label = data.place.value || "";
      if (data.place.uri) {
        var rec = window.BA.authority.resolve("place", data.place.uri);
        if (rec && rec.headword) label = rec.headword;
        input.dataset.lodUri = data.place.uri;
      }
      input.value = label || (data.place.uri || "");
      if (data.place.uri) F.attachBadge(input, data.place.uri);
    }
    if (data.cert) block.querySelector(".res-cert").value = data.cert;
    refreshSourceSelects();
    if (data.source) F.setSourceSelect(block.querySelector(".res-source"), data.source);
    F.initTooltips(block);
    return block;
  }

  var biblCounter = 0;

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
    var m = /^bib(\d+)$/.exec(id);
    if (m && parseInt(m[1], 10) > biblCounter) biblCounter = parseInt(m[1], 10);

    var block = F.addBlock(biblContainer(),
      zoteroLookupHtml() +
      '<div class="row">' +
      '<div class="col-md-3"><label class="form-label">' + U.esc(lbl("title").label) +
      (lbl("title").required ? '<span class="required-star" data-bs-toggle="tooltip" title="Required field">*</span>' : "") +
      "</label><input type=\"text\" class=\"form-control bibl-title\" value=\"" + U.esc(data.title || "") + '"></div>' +
      '<div class="col-md-2"><label class="form-label">Type</label>' +
      '<select class="form-select bibl-type">' + optionsHtml(vocab("biblTypePerson"), data.type, "— type —") + "</select></div>" +
      '<div class="col-md-2">' + labelHtml("citedRange") +
      '<input type="text" class="form-control bibl-cited" value="' + U.esc(data.cited || "") + '"></div>' +
      '<div class="col-md-1"><label class="form-label">Unit</label>' +
      '<select class="form-select bibl-unit">' + optionsHtml(citedUnitList(), data.unit || "p", "—") + "</select></div>" +
      '<div class="col-md-2">' + labelHtml("ptr") +
      '<input type="url" class="form-control bibl-ptr" value="' + U.esc(data.ptr || "") + '"></div>' +
      '<div class="col-md-2"><label class="form-label">ID</label>' +
      '<input type="text" class="form-control bibl-id" value="' + U.esc(id) + '" readonly></div>' +
      "</div>");
    refreshSourceSelects();
    F.initTooltips(block);
    return block;
  }

  function inferSubtype(uri) {
    uri = uri || "";
    if (uri.indexOf("d-nb.info") !== -1) return "gnd";
    if (uri.indexOf("viaf.org") !== -1) return "viaf";
    if (uri.indexOf("wikidata.org") !== -1) return "wiki";
    if (uri.indexOf("isni.org") !== -1) return "isni";
    return "";
  }

  function addIdnoRow(uri, subtype) {
    uri = uri || "";
    if (!uri) return null;
    subtype = subtype || inferSubtype(uri);
    // Known subtype: badge shown in CAPITALS (display only); the exported
    // @subtype value in data-subtype stays lowercase. Unknown host: a select
    // populated from the idnoSubtype vocab (labels already capitalized).
    var subHtml = subtype
      ? '<span class="badge bg-secondary idno-subtype-known" data-subtype="' + U.esc(subtype) + '">' + U.esc(subtype.toUpperCase()) + "</span>"
      : '<select class="form-select form-select-sm idno-subtype-select">' + optionsHtml(vocab("idnoSubtype"), "", "— source —") + "</select>";
    // Label first, then link.
    var block = F.addBlock(idnoContainer(),
      '<div class="row align-items-center">' +
      '<div class="col-md-4">' + subHtml + "</div>" +
      '<div class="col-md-8"><a href="' + U.esc(uri) + '" target="_blank" class="idno-uri-val" data-uri="' + U.esc(uri) + '">' + U.esc(uri) + "</a></div>" +
      "</div>");
    F.initTooltips(block);
    return block;
  }

  function addIdnoFromLookup() {
    var input = document.querySelector("#personForm .idno-lookup");
    if (!input) return;
    var uri = (input.dataset.lodUri || input.value.trim());
    if (!uri) return;
    addIdnoRow(uri, "");
    // reset lookup
    delete input.dataset.lodUri;
    input.value = "";
    var badge = input.parentNode.querySelector(".lod-link");
    if (badge) badge.remove();
  }

  // Repopulate every source select from the current bibliography blocks.
  function refreshSourceSelects() {
    F.refreshSourceSelects(document.getElementById("personForm"), biblContainer());
  }

  // ---------- data collection ----------

  function fieldVal(name) {
    var el = document.querySelector('#personForm [name="' + name + '"]');
    return (el && el.value.trim()) || "";
  }

  function nameRank(type) {
    if (type === "ba-headword") return 0;
    if (type === "attested") return 1;
    return 2;
  }

  function getPersonData() {
    var names = F.blocks(namesContainer()).map(function (b) {
      return {
        name: F.val(b, "pn-name"),
        type: F.val(b, "pn-type"),
        lang: F.val(b, "pn-lang"),
        source: F.readSourceSelect(b.querySelector(".pn-source"))
      };
    }).filter(function (n) { return n.name; });
    names.sort(function (a, b) { return nameRank(a.type) - nameRank(b.type); });

    var sexSel = document.querySelector('#personForm [name="sexValue"]');
    var sexVal = sexSel ? sexSel.value : "";
    var sexLabel = (sexSel && sexSel.selectedIndex >= 0 && sexVal) ? sexSel.options[sexSel.selectedIndex].text : "";

    function lifeEvents(kind) {
      return F.blocks(lifeContainer(kind)).map(function (b) {
        var dg = F.readDateGroup(b, "ev-date");
        return {
          when: dg.when, from: dg.from, to: dg.to,
          dateCert: dg.cert, dateSource: dg.source,
          place: F.valUri(b, "ev-place"),
          placeCert: F.val(b, "ev-place-cert"), placeSource: F.readSourceSelect(b.querySelector(".ev-place-source"))
        };
      });
    }

    return {
      id: fieldVal("recordId"),
      recordTitle: fieldVal("recordTitle"),
      creatorId: fieldVal("creatorId"),
      status: fieldVal("status") || "unpublished",
      names: names,
      note: {
        text: fieldVal("noteText"), lang: fieldVal("noteLang"),
        type: fieldVal("noteType"), resp: fieldVal("noteResp")
      },
      state: { label: fieldVal("stateLabel"), cert: fieldVal("stateCert"), source: F.readSourceSelect(document.querySelector('#personForm [name="stateSource"]')) },
      births: lifeEvents("birth"),
      deaths: lifeEvents("death"),
      floruits: lifeEvents("floruit"),
      sex: { value: sexVal, label: sexLabel, cert: fieldVal("sexCert"), source: F.readSourceSelect(document.querySelector('#personForm [name="sexSource"]')) },
      faith: { text: F.readSelectWithOther(document.getElementById("personForm"), "faith"), cert: fieldVal("faithCert"), source: F.readSourceSelect(document.querySelector('#personForm [name="faithSource"]')) },
      occupations: F.blocks(occContainer()).map(function (b) {
        return { type: F.val(b, "occ-type"), cert: F.val(b, "occ-cert"), source: F.readSourceSelect(b.querySelector(".occ-source")) };
      }).filter(function (o) { return o.type || o.cert || o.source; }),
      residences: F.blocks(resContainer()).map(function (b) {
        return { place: F.valUri(b, "res-place"), cert: F.val(b, "res-cert"), source: F.readSourceSelect(b.querySelector(".res-source")) };
      }).filter(function (r) { return r.place.value || r.place.uri; }),
      bibl: F.blocks(biblContainer()).map(function (b) {
        return {
          id: F.val(b, "bibl-id"), title: F.val(b, "bibl-title"), type: F.val(b, "bibl-type"),
          cited: F.val(b, "bibl-cited"), unit: F.val(b, "bibl-unit"), ptr: F.val(b, "bibl-ptr")
        };
      }).filter(function (x) { return x.title || x.cited || x.ptr; }),
      idnos: F.blocks(idnoContainer()).map(function (b) {
        var a = b.querySelector(".idno-uri-val");
        var uri = a ? a.getAttribute("data-uri") : "";
        var known = b.querySelector(".idno-subtype-known");
        var sel = b.querySelector(".idno-subtype-select");
        var subtype = known ? known.getAttribute("data-subtype") : (sel ? sel.value : "");
        return { uri: uri, subtype: subtype };
      }).filter(function (x) { return x.uri; })
    };
  }

  // ---------- serialization ----------

  function lifeEventXml(kind, ev) {
    var dateEl = U.el("date", { when: ev.when, from: ev.from, to: ev.to, cert: ev.dateCert, source: ev.dateSource });
    var placeEl = (ev.place.value || ev.place.uri)
      ? U.el("placeName", { ref: ev.place.uri, cert: ev.placeCert, source: ev.placeSource }, U.esc(ev.place.value))
      : "";
    var kids = [dateEl, placeEl].filter(Boolean);
    if (!kids.length) return "";
    return U.el(kind, null, kids);
  }

  function buildPersonBody(d) {
    var parts = [];

    d.names.forEach(function (n) {
      parts.push(U.el("persName", { "xml:lang": n.lang, type: n.type, source: n.source },
        U.el("name", null, U.esc(n.name))));
    });

    if (d.note.text) {
      parts.push(U.el("note", {
        "xml:lang": d.note.lang,
        resp: d.note.resp ? "#" + d.note.resp : "",
        type: d.note.type
      }, U.esc(d.note.text)));
    }

    if (d.state.label) {
      parts.push(U.el("state", null,
        U.el("label", { cert: d.state.cert, source: d.state.source }, U.esc(d.state.label))));
    }

    d.births.forEach(function (ev) { var x = lifeEventXml("birth", ev); if (x) parts.push(x); });
    d.deaths.forEach(function (ev) { var x = lifeEventXml("death", ev); if (x) parts.push(x); });
    d.floruits.forEach(function (ev) { var x = lifeEventXml("floruit", ev); if (x) parts.push(x); });

    if (d.sex.value) {
      parts.push(U.el("sex", { cert: d.sex.cert, value: d.sex.value, source: d.sex.source }, U.esc(d.sex.label)));
    }

    if (d.faith.text) {
      parts.push(U.el("faith", { cert: d.faith.cert, source: d.faith.source }, U.esc(d.faith.text)));
    }

    d.occupations.forEach(function (o) {
      parts.push(U.el("occupation", { type: o.type, cert: o.cert, source: o.source }));
    });

    d.residences.forEach(function (r) {
      parts.push(U.el("residence", null,
        U.el("placeName", { ref: r.place.uri, cert: r.cert, source: r.source }, U.esc(r.place.value))));
    });

    d.bibl.forEach(function (b) {
      var kids = [];
      if (b.title) kids.push(U.el("title", null, U.esc(b.title)));
      if (b.cited) kids.push(U.el("citedRange", { unit: b.unit }, U.esc(b.cited)));
      if (b.ptr) kids.push(U.el("ptr", { target: b.ptr }));
      parts.push(U.el("bibl", { "xml:id": b.id, type: b.type }, kids));
    });

    d.idnos.forEach(function (it) {
      parts.push(U.el("idno", { type: "URI", subtype: it.subtype }, U.esc(it.uri)));
    });

    // Round-trip: unmapped person children re-emitted verbatim at the end.
    importExtras.forEach(function (x) { parts.push(x); });

    var body = "<text><body><listPerson><person>\n" + parts.join("\n") + "\n</person></listPerson></body></text>";
    if (importedStandOff) body += "\n" + importedStandOff;
    return body;
  }

  function buildPersonXML() {
    var d = getPersonData();
    var rb = H.readRecordBlock(document.getElementById("personForm"));
    return U.indent(
      H.prolog("person") + H.rootOpen("person") +
      H.build({
        entityType: "person", articleTitle: rb.recordTitle, recordId: rb.recordId,
        creatorId: rb.creatorId, status: rb.status,
        changeNote: rb.changeNote, changes: importedChanges
      }) +
      buildPersonBody(d) + "</TEI>");
  }

  // ---------- import ----------

  function serializeVerbatim(node) {
    var s = new XMLSerializer().serializeToString(node);
    return s.replace(/ xmlns="http:\/\/www\.tei-c\.org\/ns\/1\.0"/, "");
  }

  function extractStandOff(text) {
    var m = /<standOff[\s\S]*?<\/standOff>/.exec(text);
    return m ? m[0] : "";
  }

  function nameFrom(pn) {
    var type = pn.getAttribute("type") || "";
    if (type === "majlis-headword") type = "ba-headword";
    return {
      name: U.text(U.q(pn, "name") || pn),
      type: type,
      lang: pn.getAttribute("xml:lang") || "",
      source: pn.getAttribute("source") || ""
    };
  }

  function lifeEventFrom(el) {
    var date = U.q(el, "date");
    var pl = U.q(el, "placeName");
    return {
      when: U.attr(date, "when"), from: U.attr(date, "from"), to: U.attr(date, "to"),
      dateCert: U.attr(date, "cert"), dateSource: U.attr(date, "source"),
      place: { value: U.text(pl), uri: U.attr(pl, "ref") },
      placeCert: U.attr(pl, "cert"), placeSource: U.attr(pl, "source")
    };
  }

  function importPersonXML(text, filename) {
    var doc = U.parse(text); // throws on invalid XML
    var hdr = H.parse(doc);

    importedStandOff = extractStandOff(text);
    importExtras = [];
    importedChanges = hdr.changes || [];
    biblCounter = 0;

    renderForm(); // reset
    wireStaticFields();

    var recordNotice = applyRecordBlock(hdr, filename);

    var person = U.q(doc, "person");
    if (!person) {
      showAlert(recordNotice || "No <person> element found in the uploaded file.", "warning");
      F.initTooltips(document.getElementById("personForm"));
      return hdr;
    }

    var kids = Array.prototype.slice.call(person.children);

    // Pass A: bibliography first so source selects can be populated.
    kids.forEach(function (ch) {
      if (ch.localName !== "bibl") return;
      addBiblBlock({
        id: ch.getAttribute("xml:id") || "",
        title: U.text(U.q(ch, "title")),
        type: ch.getAttribute("type") || "",
        cited: U.text(U.q(ch, "citedRange")),
        unit: U.attr(U.q(ch, "citedRange"), "unit"),
        ptr: U.attr(U.q(ch, "ptr"), "target")
      });
    });

    // Pass B: everything else in document order (preserves grouping).
    var extraTags = [];
    kids.forEach(function (ch) {
      switch (ch.localName) {
        case "persName":
          addNameBlock(nameFrom(ch));
          break;
        case "note":
          document.querySelector('#personForm [name="noteText"]').value = U.text(ch);
          document.querySelector('#personForm [name="noteLang"]').value = ch.getAttribute("xml:lang") || "";
          document.querySelector('#personForm [name="noteType"]').value = ch.getAttribute("type") || "";
          document.querySelector('#personForm [name="noteResp"]').value = (ch.getAttribute("resp") || "").replace(/^#/, "");
          break;
        case "state":
          var lab = U.q(ch, "label");
          document.querySelector('#personForm [name="stateLabel"]').value = U.text(lab);
          document.querySelector('#personForm [name="stateCert"]').value = U.attr(lab, "cert");
          refreshSourceSelects();
          F.setSourceSelect(document.querySelector('#personForm [name="stateSource"]'), U.attr(lab, "source"));
          break;
        case "birth":
        case "death":
        case "floruit":
          addLifeEventBlock(ch.localName, lifeEventFrom(ch));
          break;
        case "sex":
          document.querySelector('#personForm [name="sexValue"]').value = ch.getAttribute("value") || "";
          document.querySelector('#personForm [name="sexCert"]').value = ch.getAttribute("cert") || "";
          refreshSourceSelects();
          F.setSourceSelect(document.querySelector('#personForm [name="sexSource"]'), ch.getAttribute("source") || "");
          break;
        case "faith":
          F.setSelectWithOther(document.getElementById("personForm"), "faith", U.text(ch));
          document.querySelector('#personForm [name="faithCert"]').value = ch.getAttribute("cert") || "";
          refreshSourceSelects();
          F.setSourceSelect(document.querySelector('#personForm [name="faithSource"]'), ch.getAttribute("source") || "");
          break;
        case "occupation":
          addOccBlock({ type: ch.getAttribute("type") || "", cert: ch.getAttribute("cert") || "", source: ch.getAttribute("source") || "" });
          break;
        case "residence":
          var rpl = U.q(ch, "placeName");
          addResBlock({
            place: { value: U.text(rpl), uri: U.attr(rpl, "ref") },
            cert: U.attr(rpl, "cert"), source: U.attr(rpl, "source")
          });
          break;
        case "idno":
          if (ch.getAttribute("type") === "URI" && U.text(ch)) addIdnoRow(U.text(ch), ch.getAttribute("subtype") || "");
          break;
        case "bibl":
          break; // handled in pass A
        default:
          importExtras.push(serializeVerbatim(ch));
          extraTags.push(ch.localName);
      }
    });

    if (extraTags.length) {
      console.warn("BA person import: preserved unmapped <person> children verbatim: " + extraTags.join(", "));
    }

    refreshSourceSelects();
    F.initTooltips(document.getElementById("personForm"));
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
        ? window.BA.config.baseUri + "/" + window.BA.config.entityPaths.person + "/" + id
        : "";
    }
  }

  function wireStaticFields() {
    var idInput = document.querySelector('#personForm [name="recordId"]');
    if (idInput) idInput.addEventListener("input", updateUriDisplay);
  }

  // Populate the shared Record block from a parsed header (identical logic in
  // all four editors). Record ID is recovered from the header idno, else the
  // uploaded filename; returns a warning string when neither yields an id.
  function applyRecordBlock(hdr, filename) {
    var form = document.getElementById("personForm");
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
    var xml = buildPersonXML();
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
    var d = getPersonData();
    var id = d.id || "person";
    window.BA.authority.checkCollision("person", id).then(function (exists) {
      if (exists && !window.confirm("A person with id " + id +
        " already exists in the index. Download anyway?")) return;
      var blob = new Blob([buildPersonXML()], { type: "application/xml" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = id + ".xml";
      a.click();
      F.markClean(); // record saved locally
    });
  }

  function newRecord(skipConfirm) {
    if (!skipConfirm && !window.confirm("Clear the form and start a new person record?")) return;
    biblCounter = 0;
    importedStandOff = "";
    importExtras = [];
    importedChanges = [];
    renderForm();
    wireStaticFields();
    addNameBlock();
    window.BA.authority.nextId("person").then(function (id) {
      var input = document.querySelector('#personForm [name="recordId"]');
      if (input && !input.value) { input.value = id; updateUriDisplay(); }
    });
    F.initTooltips(document.getElementById("personForm"));
    F.markClean(); // fresh form
  }

  function init() {
    U = window.BA.util; F = window.BA.form; H = window.BA.header;
    LBL = window.BA.uiText.labels.person.person;
    V = window.BA.uiText.vocab;

    window.BA.authority.load("place");  // local-place autocomplete + resolve()
    window.BA.authority.load("person"); // nextId + collision check

    newRecord(true);

    // Unsaved-changes guard: flag edits inside the form, warn on exit.
    F.trackDirty(document.getElementById("personForm"));
    F.installUnloadGuard();

    // ?view={id} read-only view mode takes precedence over the ?load={id} deep
    // link; both import data/persons/{id}.xml on init.
    if (!loadViewFromQuery()) loadFromQuery();

    // Add-buttons live inside the re-renderable form -> pure delegation.
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      if (F.isViewMode()) return;
      if (e.target.closest("#addNameBtn")) addNameBlock();
      if (e.target.closest("#addBirthBtn")) addLifeEventBlock("birth");
      if (e.target.closest("#addDeathBtn")) addLifeEventBlock("death");
      if (e.target.closest("#addFloruitBtn")) addLifeEventBlock("floruit");
      if (e.target.closest("#addOccBtn")) addOccBlock();
      if (e.target.closest("#addResBtn")) addResBlock();
      if (e.target.closest("#addBiblBtn")) addBiblBlock();
      if (e.target.closest("#addIdnoBtn")) addIdnoFromLookup();
      if (e.target.closest("#reloadIndexBtn")) reloadIndexes();
    });

    // Zotero bibliography lookup -> fill title + ptr, clear the lookup.
    document.addEventListener("ba-lod-selected", fillBiblFromZotero);

    // bibliography changes -> refresh source selects
    document.getElementById("personForm").addEventListener("input", function (e) {
      if (e.target.closest && e.target.closest(".bibl-container")) refreshSourceSelects();
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
            importPersonXML(ev.target.result, file.name);
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
      F.openRepoPicker("person", function (text, filename) {
        importPersonXML(text, filename);
        F.markClean();
        showAlert("Loaded " + filename + " from the repository.", "success");
      });
    });

    // Submit to repository: validation gate lives in BA.github.openSubmit.
    btn = document.getElementById("submitRepoBtn");
    if (btn) btn.addEventListener("click", function () {
      var d = getPersonData();
      var rb = H.readRecordBlock(document.getElementById("personForm"));
      window.BA.github.openSubmit({
        type: "person", id: d.id || "person", xml: buildPersonXML(),
        data: d, changeNote: rb.changeNote
      });
    });
  }

  // ?load={id}: resolve the id in the person index and import its file.
  function loadFromQuery() {
    var id = new URLSearchParams(location.search).get("load");
    if (!id || !/^\d+$/.test(id)) return;
    window.BA.authority.load("person").then(function (recs) {
      var rec = null;
      for (var i = 0; i < recs.length; i++) { if (String(recs[i].id) === id) { rec = recs[i]; break; } }
      if (!rec) {
        showAlert("Record " + id + " not found in the person index — rebuild the index if the file was just added", "warning");
        return;
      }
      fetch(rec.file)
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then(function (text) { importPersonXML(text, (rec.file || "").split("/").pop()); F.markClean(); })
        .catch(function (err) { showAlert("Could not load record " + id + ": " + err.message, "danger"); });
    });
  }

  // ?view={id}: import the record (same path as ?load=), then lock the form
  // read-only. Returns true when a valid ?view= id was present (so init skips
  // the ?load= path). _viewMode is set before import so badges rendered during
  // import pick up their internal "view this record" links.
  function loadViewFromQuery() {
    var id = new URLSearchParams(location.search).get("view");
    if (!id || !/^\d+$/.test(id)) return false;
    window.BA.authority.load("person").then(function (recs) {
      var rec = null;
      for (var i = 0; i < recs.length; i++) { if (String(recs[i].id) === id) { rec = recs[i]; break; } }
      if (!rec) {
        showAlert("Record " + id + " not found in the person index — rebuild the index if the file was just added", "warning");
        return;
      }
      fetch(rec.file)
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then(function (text) {
          F._viewMode = true;
          importPersonXML(text, (rec.file || "").split("/").pop());
          F.enterViewMode(document.getElementById("personForm"), {
            type: "person",
            id: id,
            editorHref: "person-editor.html?load=" + id,
            collectionHref: "collection-persons.html"
          });
          buildRevisionHistory();
        })
        .catch(function (err) { showAlert("Could not load record " + id + ": " + err.message, "danger"); });
    });
    return true;
  }

  // Read-only revision-history table under the Record block (view mode only).
  // Each imported <change> becomes one row: resolved editor name, date, note.
  // Appended AFTER F.tagEmpty so this content-only section is never folded away.
  function buildRevisionHistory() {
    if (!importedChanges || !importedChanges.length) return;
    var editorsById = {};
    (window.BA.config.editors || []).forEach(function (ed) { editorsById[ed.id] = ed.name; });

    var rows = importedChanges.map(function (chStr) {
      var el = null;
      try { el = U.q(U.parse("<ba-root>" + chStr + "</ba-root>"), "change"); } catch (e) { el = null; }
      if (!el) return "";
      var who = (el.getAttribute("who") || "").replace(/^#/, "");
      var when = el.getAttribute("when") || "";
      var note = U.text(el);
      var name = editorsById[who] || who;
      return "<tr><td>" + U.esc(name) + "</td><td>" + U.esc(when) + "</td><td>" + U.esc(note) + "</td></tr>";
    }).filter(Boolean).join("");
    if (!rows) return;

    var section = document.createElement("div");
    section.className = "border rounded p-3 mb-4 ba-revision-history";
    section.innerHTML =
      "<h5>Revision history</h5>" +
      '<table class="table table-sm mb-0"><thead><tr>' +
      "<th>Editor</th><th>Date</th><th>Note</th></tr></thead><tbody>" + rows + "</tbody></table>";

    var accordion = document.getElementById("personAccordion");
    if (accordion && accordion.parentNode) accordion.parentNode.insertBefore(section, accordion);
    else document.getElementById("personForm").appendChild(section);
  }

  document.addEventListener("DOMContentLoaded", init);

  // Public API (used by tests and by later tasks' cross-editor links).
  window.PersonEditor = {
    init: init,
    getPersonData: function () { return getPersonData(); },
    buildPersonBody: function (d) { return buildPersonBody(d); },
    buildPersonXML: function () { return buildPersonXML(); },
    importPersonXML: function (t, f) { return importPersonXML(t, f); },
    addNameBlock: function (d) { return addNameBlock(d); },
    addLifeEventBlock: function (k, d) { return addLifeEventBlock(k, d); },
    addOccBlock: function (d) { return addOccBlock(d); },
    addResBlock: function (d) { return addResBlock(d); },
    addBiblBlock: function (d) { return addBiblBlock(d); },
    addIdnoRow: function (u, s) { return addIdnoRow(u, s); },
    refreshSourceSelects: refreshSourceSelects,
    newRecord: newRecord
  };
})();
